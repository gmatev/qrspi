import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type Harness = "claude" | "codex";

interface PackageOptions {
  repositoryRoot?: string;
  outputRoot?: string;
}

interface MarkdownDocument {
  attributes: Record<string, unknown>;
  body: string;
}

interface AgentSource {
  attributes: Record<string, unknown>;
  body: string;
  name: string;
}

type AgentModels = Record<string, string>;

const defaultRepositoryRoot = resolve(import.meta.dir, "..");
const codexSkillFields = ["name", "description", "argument-hint"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${context} must define a non-empty ${key}`);
  }
  return value;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

async function directoryNames(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function fileNames(path: string, extension: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && extname(entry.name) === extension)
    .map((entry) => entry.name)
    .sort();
}

async function readMarkdown(path: string): Promise<MarkdownDocument> {
  const source = await readFile(path, "utf8");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match?.[1]) {
    throw new Error(`${path} does not contain valid YAML frontmatter`);
  }

  const attributes = parseYaml(match[1]);
  if (!isRecord(attributes)) {
    throw new Error(`${path} frontmatter must be a mapping`);
  }

  return { attributes, body: match[2] ?? "" };
}

function writeMarkdown(document: MarkdownDocument): string {
  return `---\n${stringifyYaml(document.attributes).trimEnd()}\n---\n${document.body}`;
}

async function readAgentModels(path: string): Promise<AgentModels> {
  const parsed = Bun.TOML.parse(await readFile(path, "utf8"));
  if (!isRecord(parsed) || !isRecord(parsed.agents)) {
    throw new Error(`${path} must define an agents table`);
  }

  const models: AgentModels = {};
  for (const [name, value] of Object.entries(parsed.agents)) {
    if (!isRecord(value)) {
      throw new Error(`${path} agents.${name} must be a table`);
    }
    models[name] = requireString(value, "model", `${path} agents.${name}`);
  }
  return models;
}

function validateMappings(
  harness: Harness,
  agentNames: string[],
  models: AgentModels,
): void {
  const configuredNames = Object.keys(models).sort();
  const missing = agentNames.filter((name) => !(name in models));
  const extra = configuredNames.filter((name) => !agentNames.includes(name));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `${harness} agent mappings do not match source agents; missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}`,
    );
  }
}

async function loadAgents(sourceRoot: string): Promise<AgentSource[]> {
  const agentRoot = join(sourceRoot, "agents");
  const files = await fileNames(agentRoot, ".md");
  if (files.length === 0) throw new Error(`${agentRoot} contains no agents`);

  const agents: AgentSource[] = [];
  const seenNames = new Set<string>();
  for (const file of files) {
    const document = await readMarkdown(join(agentRoot, file));
    const name = requireString(document.attributes, "name", file);
    requireString(document.attributes, "description", file);
    requireString(document.attributes, "tools", file);
    if ("model" in document.attributes) {
      throw new Error(`${file} must not define a model; use harness configuration`);
    }
    if (`${name}.md` !== file) {
      throw new Error(`${file} must match its agent name ${name}`);
    }
    if (seenNames.has(name)) throw new Error(`duplicate source agent name: ${name}`);
    seenNames.add(name);
    agents.push({ ...document, name });
  }
  return agents;
}

function codexSkillAttributes(
  attributes: Record<string, unknown>,
): Record<string, unknown> {
  const transformed: Record<string, unknown> = {};
  for (const field of codexSkillFields) {
    if (field in attributes) transformed[field] = attributes[field];
  }
  return transformed;
}

function codexSkillMetadata(name: string, description: string): Record<string, unknown> {
  const skillName = name
    .replace(/^qrspi-/, "")
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
  const isSetup = name === "setup-qrspi";
  const isRouter = name === "qrspi";

  return {
    interface: {
      display_name: isSetup ? "Setup QRSPI" : isRouter ? "QRSPI" : `QRSPI ${skillName}`,
      short_description: description,
      default_prompt: isSetup
        ? "Use /setup-qrspi to configure this repository for QRSPI."
        : isRouter
          ? "Use /qrspi to create or resume a managed QRSPI task."
          : `Use /${name} to run the ${skillName} phase.`,
    },
    policy: { allow_implicit_invocation: false },
  };
}

function validateCodexSkillMetadata(value: unknown, path: string): void {
  if (!isRecord(value) || !isRecord(value.interface) || !isRecord(value.policy)) {
    throw new Error(`${path} must define interface and policy mappings`);
  }
  requireString(value.interface, "default_prompt", `${path} interface`);
  if (value.policy.allow_implicit_invocation !== false) {
    throw new Error(`${path} must disable implicit invocation`);
  }
}

async function buildClaude(
  buildRoot: string,
  sourceRoot: string,
  harnessRoot: string,
  agents: AgentSource[],
  models: AgentModels,
  skillNames: string[],
): Promise<void> {
  const claudeRoot = join(buildRoot, "claude", ".claude");
  const agentRoot = join(claudeRoot, "agents");
  const skillRoot = join(claudeRoot, "skills");
  const hookRoot = join(claudeRoot, "hooks");
  await mkdir(agentRoot, { recursive: true });
  await mkdir(skillRoot, { recursive: true });
  await mkdir(hookRoot, { recursive: true });
  await cp(join(sourceRoot, "tools"), join(claudeRoot, "tools"), { recursive: true });
  await cp(join(sourceRoot, "hooks", "qrspi-context.ts"), join(hookRoot, "qrspi-context.ts"));
  await cp(join(harnessRoot, "claude", "settings.json"), join(claudeRoot, "settings.json"));

  for (const agent of agents) {
    const output = writeMarkdown({
      attributes: { ...agent.attributes, model: models[agent.name] },
      body: agent.body,
    });
    await writeFile(join(agentRoot, `${agent.name}.md`), output);
  }

  for (const skillName of skillNames) {
    const outputSkillRoot = join(skillRoot, skillName);
    await cp(join(sourceRoot, "skills", skillName), outputSkillRoot, {
      recursive: true,
    });
  }
}

async function buildCodex(
  buildRoot: string,
  sourceRoot: string,
  harnessRoot: string,
  agents: AgentSource[],
  models: AgentModels,
  skillNames: string[],
): Promise<void> {
  const codexRoot = join(buildRoot, "codex", ".codex");
  const agentRoot = join(codexRoot, "agents");
  const skillRoot = join(buildRoot, "codex", ".agents", "skills");
  const hookRoot = join(codexRoot, "hooks");
  await mkdir(agentRoot, { recursive: true });
  await mkdir(skillRoot, { recursive: true });
  await mkdir(hookRoot, { recursive: true });
  await cp(join(sourceRoot, "tools"), join(codexRoot, "tools"), { recursive: true });
  await cp(join(sourceRoot, "hooks", "qrspi-context.ts"), join(hookRoot, "qrspi-context.ts"));
  await cp(join(harnessRoot, "codex", "hooks.json"), join(codexRoot, "hooks.json"));

  for (const agent of agents) {
    const output = Bun.TOML.stringify({
      name: agent.name,
      description: requireString(agent.attributes, "description", agent.name),
      model: models[agent.name],
      developer_instructions: agent.body.trim(),
    });
    if (output === undefined) throw new Error(`could not serialize ${agent.name}`);
    await writeFile(join(agentRoot, `${agent.name}.toml`), output);
  }

  for (const skillName of skillNames) {
    const sourceSkillRoot = join(sourceRoot, "skills", skillName);
    const outputSkillRoot = join(skillRoot, skillName);
    await cp(sourceSkillRoot, outputSkillRoot, { recursive: true });

    const sourceSkill = await readMarkdown(join(sourceSkillRoot, "SKILL.md"));
    const name = requireString(sourceSkill.attributes, "name", skillName);
    const description = requireString(sourceSkill.attributes, "description", skillName);
    if (name !== skillName) {
      throw new Error(`${skillName} frontmatter name must match its directory`);
    }
    if (sourceSkill.attributes["disable-model-invocation"] !== true) {
      throw new Error(`${skillName} must disable Claude model invocation`);
    }
    await writeFile(
      join(outputSkillRoot, "SKILL.md"),
      writeMarkdown({
        attributes: codexSkillAttributes(sourceSkill.attributes),
        body: sourceSkill.body,
      }),
    );

    const metadata = codexSkillMetadata(name, description);
    const metadataRoot = join(outputSkillRoot, "agents");
    await mkdir(metadataRoot, { recursive: true });
    const metadataPath = join(metadataRoot, "openai.yaml");
    await writeFile(metadataPath, stringifyYaml(metadata));
    validateCodexSkillMetadata(metadata, metadataPath);
  }
}

async function validateGenerated(
  buildRoot: string,
  agents: AgentSource[],
  models: Record<Harness, AgentModels>,
  skillNames: string[],
): Promise<void> {
  for (const agent of agents) {
    const claude = await readMarkdown(
      join(buildRoot, "claude", ".claude", "agents", `${agent.name}.md`),
    );
    if (claude.attributes.model !== models.claude[agent.name]) {
      throw new Error(`Claude model mapping was not applied for ${agent.name}`);
    }

    const codexPath = join(
      buildRoot,
      "codex",
      ".codex",
      "agents",
      `${agent.name}.toml`,
    );
    const codex = Bun.TOML.parse(await readFile(codexPath, "utf8"));
    if (!isRecord(codex)) throw new Error(`${codexPath} must be a TOML table`);
    const allowedFields = ["name", "description", "model", "developer_instructions"];
    const extraFields = Object.keys(codex).filter((key) => !allowedFields.includes(key));
    if (extraFields.length > 0) {
      throw new Error(`${codexPath} contains unsupported fields: ${extraFields.join(", ")}`);
    }
    if (codex.name !== agent.name || codex.model !== models.codex[agent.name]) {
      throw new Error(`Codex agent mapping was not applied for ${agent.name}`);
    }
    requireString(codex, "description", codexPath);
    requireString(codex, "developer_instructions", codexPath);
  }

  for (const skillName of skillNames) {
    const claudeRoot = join(buildRoot, "claude", ".claude", "skills", skillName);
    const claude = await readMarkdown(join(claudeRoot, "SKILL.md"));
    if (claude.attributes["disable-model-invocation"] !== true) {
      throw new Error(`${skillName} lost Claude explicit-invocation metadata`);
    }
    if (await pathExists(join(claudeRoot, "agents", "openai.yaml"))) {
      throw new Error(`${skillName} Claude output contains Codex-only metadata`);
    }

    const codexRoot = join(buildRoot, "codex", ".agents", "skills", skillName);
    const codex = await readMarkdown(join(codexRoot, "SKILL.md"));
    const unsupported = Object.keys(codex.attributes).filter(
      (key) => !codexSkillFields.includes(key as (typeof codexSkillFields)[number]),
    );
    if (unsupported.length > 0) {
      throw new Error(`${skillName} Codex output contains unsupported fields: ${unsupported.join(", ")}`);
    }
    const metadataPath = join(codexRoot, "agents", "openai.yaml");
    validateCodexSkillMetadata(parseYaml(await readFile(metadataPath, "utf8")), metadataPath);

  }

  for (const [harness, harnessDirectory] of [
    ["claude", ".claude"],
    ["codex", ".codex"],
  ] as const) {
    const root = join(buildRoot, harness, harnessDirectory);
    for (const path of [
      "tools/qrspi.ts",
      "tools/protocol.ts",
      "tools/task.ts",
      "tools/phase.ts",
      "hooks/qrspi-context.ts",
    ]) {
      if (!(await pathExists(join(root, path)))) {
        throw new Error(`${harness} output is missing ${path}`);
      }
    }
    const config = harness === "claude" ? "settings.json" : "hooks.json";
    const parsed: unknown = JSON.parse(await readFile(join(root, config), "utf8"));
    if (!isRecord(parsed) || !isRecord(parsed.hooks)) {
      throw new Error(`${harness} ${config} must define hooks`);
    }
  }
}

export async function packageDistributions(options: PackageOptions = {}): Promise<string> {
  const repositoryRoot = resolve(options.repositoryRoot ?? defaultRepositoryRoot);
  const outputRoot = resolve(options.outputRoot ?? join(repositoryRoot, "dist"));
  const sourceRoot = join(repositoryRoot, "src");
  const harnessRoot = join(repositoryRoot, "harness");
  const buildRoot = join(
    dirname(outputRoot),
    `.${basename(outputRoot)}.build-${process.pid}-${Date.now()}`,
  );

  if (await pathExists(outputRoot)) {
    const outputStat = await stat(outputRoot);
    if (!outputStat.isDirectory()) {
      throw new Error(`${outputRoot} exists and is not a directory`);
    }
  }

  await rm(buildRoot, { recursive: true, force: true });
  await mkdir(buildRoot, { recursive: true });

  try {
    const agents = await loadAgents(sourceRoot);
    const agentNames = agents.map((agent) => agent.name).sort();
    const skillNames = await directoryNames(join(sourceRoot, "skills"));
    if (skillNames.length === 0) throw new Error(`${sourceRoot}/skills contains no skills`);

    const models = {
      claude: await readAgentModels(join(harnessRoot, "claude", "agents.toml")),
      codex: await readAgentModels(join(harnessRoot, "codex", "agents.toml")),
    } satisfies Record<Harness, AgentModels>;
    validateMappings("claude", agentNames, models.claude);
    validateMappings("codex", agentNames, models.codex);

    await buildClaude(buildRoot, sourceRoot, harnessRoot, agents, models.claude, skillNames);
    await buildCodex(
      buildRoot,
      sourceRoot,
      harnessRoot,
      agents,
      models.codex,
      skillNames,
    );
    await validateGenerated(buildRoot, agents, models, skillNames);

    await rm(outputRoot, { recursive: true, force: true });
    await rename(buildRoot, outputRoot);
    return outputRoot;
  } catch (error) {
    await rm(buildRoot, { recursive: true, force: true });
    throw error;
  }
}

if (import.meta.main) {
  if (Bun.argv.length !== 2) {
    console.error("Usage: bun scripts/package.ts");
    process.exit(1);
  }
  try {
    const outputRoot = await packageDistributions();
    console.log(`Packaged Claude and Codex distributions in ${outputRoot}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
