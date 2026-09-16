import { describe, expect, test } from "bun:test";
import {
  readJsonFile,
  readMarkdownFile,
  readYamlFile,
  repositoryPath,
} from "../helpers/repository";

const skillNames = [
  "qrspi-design",
  "qrspi-implement",
  "qrspi-plan",
  "qrspi-pr",
  "qrspi-question",
  "qrspi-research",
  "qrspi-structure",
  "qrspi-worktree",
];

interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: { name: string };
  license: string;
}

interface Marketplace {
  plugins: Array<{
    name: string;
    description: string;
    author: { name: string };
  }>;
}

interface SkillFrontmatter {
  name: string;
  "disable-model-invocation": boolean;
}

interface OpenAiMetadata {
  interface: { default_prompt: string };
  policy: { allow_implicit_invocation: boolean };
}

describe("cross-client contract", () => {
  test("keeps shared plugin identity aligned", async () => {
    const claude = await readJsonFile<PluginManifest>(
      repositoryPath("plugin", ".claude-plugin", "plugin.json"),
    );
    const codex = await readJsonFile<PluginManifest>(
      repositoryPath("plugin", ".codex-plugin", "plugin.json"),
    );
    const marketplace = await readJsonFile<Marketplace>(
      repositoryPath(".claude-plugin", "marketplace.json"),
    );
    const marketplacePlugin = marketplace.plugins.find(
      (plugin) => plugin.name === "qrspi",
    );

    expect(codex.name).toBe(claude.name);
    expect(codex.version).toBe(claude.version);
    expect(codex.description).toBe(claude.description);
    expect(codex.author.name).toBe(claude.author.name);
    expect(codex.license).toBe(claude.license);
    expect(marketplacePlugin).toMatchObject({
      name: claude.name,
      description: claude.description,
      author: claude.author,
    });
  });

  test("keeps every phase explicitly invoked in both clients", async () => {
    for (const skillName of skillNames) {
      const skill = await readMarkdownFile<SkillFrontmatter>(
        repositoryPath("plugin", "skills", skillName, "SKILL.md"),
      );
      const openAi = await readYamlFile<OpenAiMetadata>(
        repositoryPath(
          "plugin",
          "skills",
          skillName,
          "agents",
          "openai.yaml",
        ),
      );

      expect(skill.attributes.name).toBe(skillName);
      expect(skill.attributes["disable-model-invocation"]).toBe(true);
      expect(openAi.policy.allow_implicit_invocation).toBe(false);
      expect(openAi.interface.default_prompt).toContain(`$${skillName}`);
    }
  });
});
