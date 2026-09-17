import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packageDistributions } from "../../scripts/package";
import {
  entryNames,
  fileExists,
  readMarkdownFile,
  readTomlFile,
  readYamlFile,
  repositoryPath,
} from "../helpers/repository";

const workflowSkills = [
  "qrspi-design",
  "qrspi-implement",
  "qrspi-plan",
  "qrspi-pr",
  "qrspi-question",
  "qrspi-research",
  "qrspi-structure",
  "qrspi-worktree",
];
const expectedSkills = ["qrspi", ...workflowSkills, "setup-qrspi"];

const expectedAgents = [
  "codebase-analyzer",
  "codebase-locator",
  "codebase-pattern-finder",
  "web-search-researcher",
];

let temporaryRoot: string;
let distributionRoot: string;

beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), "qrspi-distribution-"));
  distributionRoot = join(temporaryRoot, "dist");
  await packageDistributions({ outputRoot: distributionRoot });
});

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe("distribution", () => {
  test("does not retain legacy plugin packaging surfaces", async () => {
    expect(await fileExists(repositoryPath("plugin"))).toBe(false);
    expect(await fileExists(repositoryPath(".claude-plugin"))).toBe(false);
  });

  test("keeps all workflow sources in the canonical tree", async () => {
    const skillRoot = repositoryPath("src", "skills");
    expect(await entryNames(skillRoot)).toEqual(expectedSkills);

    expect(workflowSkills).toHaveLength(8);

    for (const skill of expectedSkills) {
      expect(await fileExists(skillRoot, skill, "SKILL.md")).toBe(true);
      expect(await fileExists(skillRoot, skill, "agents", "openai.yaml")).toBe(false);
      await readMarkdownFile(join(skillRoot, skill, "SKILL.md"));
    }
    expect(await fileExists(repositoryPath("src", "tools", "qrspi.ts"))).toBe(true);
    expect(await fileExists(repositoryPath("src", "hooks", "qrspi-context.ts"))).toBe(true);
  });

  test("packages the complete Claude project layout", async () => {
    const skillRoot = join(distributionRoot, "claude", ".claude", "skills");
    const agentRoot = join(distributionRoot, "claude", ".claude", "agents");
    expect(await entryNames(skillRoot)).toEqual(expectedSkills);
    expect((await entryNames(agentRoot)).map((file) => file.replace(/\.md$/, ""))).toEqual(
      expectedAgents,
    );

    for (const skill of expectedSkills) {
      const document = await readMarkdownFile(join(skillRoot, skill, "SKILL.md"));
      expect(await fileExists(skillRoot, skill, "agents", "openai.yaml")).toBe(false);
      expect(document.body).not.toContain("$qrspi");
    }
    expect(await fileExists(distributionRoot, "claude", ".claude", "tools", "qrspi.ts")).toBe(true);
    expect(await fileExists(distributionRoot, "claude", ".claude", "hooks", "qrspi-context.ts")).toBe(true);
    expect(await fileExists(distributionRoot, "claude", ".claude", "settings.json")).toBe(true);
    expect(await fileExists(skillRoot, "qrspi", "scripts")).toBe(false);
    expect(await fileExists(skillRoot, "qrspi", "references", "task-resume.md")).toBe(true);
    for (const agent of expectedAgents) {
      await readMarkdownFile(join(agentRoot, `${agent}.md`));
    }
  });

  test("packages the complete Codex project layout", async () => {
    const skillRoot = join(distributionRoot, "codex", ".agents", "skills");
    const agentRoot = join(distributionRoot, "codex", ".codex", "agents");
    expect(await entryNames(skillRoot)).toEqual(expectedSkills);
    expect((await entryNames(agentRoot)).map((file) => file.replace(/\.toml$/, ""))).toEqual(
      expectedAgents,
    );

    for (const skill of expectedSkills) {
      const document = await readMarkdownFile(join(skillRoot, skill, "SKILL.md"));
      const metadata = await readYamlFile<{ interface: { default_prompt: string }; policy: { allow_implicit_invocation: boolean } }>(
        join(skillRoot, skill, "agents", "openai.yaml"),
      );
      expect(document.body).not.toContain("$qrspi");
      expect(metadata.interface.default_prompt).toStartWith(`Use /${skill}`);
      expect(metadata.policy.allow_implicit_invocation).toBe(false);
    }
    expect(await fileExists(distributionRoot, "codex", ".codex", "tools", "qrspi.ts")).toBe(true);
    expect(await fileExists(distributionRoot, "codex", ".codex", "hooks", "qrspi-context.ts")).toBe(true);
    expect(await fileExists(distributionRoot, "codex", ".codex", "hooks.json")).toBe(true);
    expect(await fileExists(skillRoot, "qrspi", "scripts")).toBe(false);
    expect(await fileExists(skillRoot, "qrspi", "references", "task-resume.md")).toBe(true);
    for (const agent of expectedAgents) {
      await readTomlFile(join(agentRoot, `${agent}.toml`));
    }
  });
});
