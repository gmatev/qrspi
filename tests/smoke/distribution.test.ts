import { describe, expect, test } from "bun:test";
import {
  entryNames,
  fileExists,
  readJsonFile,
  readMarkdownFile,
  readYamlFile,
  repositoryPath,
} from "../helpers/repository";

const expectedSkills = [
  "qrspi-design",
  "qrspi-implement",
  "qrspi-plan",
  "qrspi-pr",
  "qrspi-question",
  "qrspi-research",
  "qrspi-structure",
  "qrspi-worktree",
];

describe("plugin distribution", () => {
  test("ships all eight workflow skills with both client surfaces", async () => {
    const skillRoot = repositoryPath("plugin", "skills");

    expect(await entryNames(skillRoot)).toEqual(expectedSkills);

    for (const skill of expectedSkills) {
      expect(await fileExists(skillRoot, skill, "SKILL.md")).toBe(true);
      expect(await fileExists(skillRoot, skill, "agents", "openai.yaml")).toBe(
        true,
      );
    }
  });

  test("ships parseable manifests that point at the plugin directory", async () => {
    const marketplace = await readJsonFile<{
      plugins: Array<{ name: string; source: string }>;
    }>(repositoryPath(".claude-plugin", "marketplace.json"));

    await readJsonFile(repositoryPath("plugin", ".claude-plugin", "plugin.json"));
    await readJsonFile(repositoryPath("plugin", ".codex-plugin", "plugin.json"));

    expect(marketplace.plugins).toContainEqual(
      expect.objectContaining({ name: "qrspi", source: "./plugin" }),
    );
  });

  test("ships parseable skill and research-agent metadata", async () => {
    for (const skill of expectedSkills) {
      await readMarkdownFile(
        repositoryPath("plugin", "skills", skill, "SKILL.md"),
      );
      await readYamlFile(
        repositoryPath("plugin", "skills", skill, "agents", "openai.yaml"),
      );
    }

    const agentRoot = repositoryPath("plugin", "agents");
    const agentFiles = (await entryNames(agentRoot)).filter((name) =>
      name.endsWith(".md"),
    );

    expect(agentFiles.length).toBeGreaterThan(0);
    for (const agentFile of agentFiles) {
      await readMarkdownFile(repositoryPath("plugin", "agents", agentFile));
    }
  });
});
