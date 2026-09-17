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
    expect(await fileExists(skillRoot, "qrspi", "scripts", "qrspi.ts")).toBe(true);
  });

  test("packages the complete Claude project layout", async () => {
    const skillRoot = join(distributionRoot, "claude", ".claude", "skills");
    const agentRoot = join(distributionRoot, "claude", ".claude", "agents");
    expect(await entryNames(skillRoot)).toEqual(expectedSkills);
    expect((await entryNames(agentRoot)).map((file) => file.replace(/\.md$/, ""))).toEqual(
      expectedAgents,
    );

    for (const skill of expectedSkills) {
      await readMarkdownFile(join(skillRoot, skill, "SKILL.md"));
      expect(await fileExists(skillRoot, skill, "agents", "openai.yaml")).toBe(false);
    }
    expect(await fileExists(skillRoot, "qrspi", "scripts", "qrspi.ts")).toBe(true);
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
      await readMarkdownFile(join(skillRoot, skill, "SKILL.md"));
      await readYamlFile(join(skillRoot, skill, "agents", "openai.yaml"));
    }
    expect(await fileExists(skillRoot, "qrspi", "scripts", "qrspi.ts")).toBe(true);
    for (const agent of expectedAgents) {
      await readTomlFile(join(agentRoot, `${agent}.toml`));
    }
  });
});
