import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packageDistributions } from "../../scripts/package";
import {
  fileExists,
  readMarkdownFile,
  readTomlFile,
  readYamlFile,
} from "../helpers/repository";

const skillNames = [
  "qrspi",
  "qrspi-design",
  "qrspi-implement",
  "qrspi-plan",
  "qrspi-pr",
  "qrspi-question",
  "qrspi-research",
  "qrspi-structure",
  "qrspi-worktree",
  "setup-qrspi",
];

const agentModels = {
  "codebase-analyzer": { claude: "sonnet", codex: "gpt-5.6-terra" },
  "codebase-locator": { claude: "haiku", codex: "gpt-5.6-luna" },
  "codebase-pattern-finder": { claude: "sonnet", codex: "gpt-5.6-terra" },
  "web-search-researcher": { claude: "haiku", codex: "gpt-5.6-luna" },
} as const;

interface SkillFrontmatter {
  description: string;
  name: string;
  "disable-model-invocation"?: boolean;
}

interface OpenAiMetadata {
  interface: {
    default_prompt: string;
    display_name: string;
    short_description: string;
  };
  policy: { allow_implicit_invocation: boolean };
}

interface CodexAgent {
  name: string;
  description: string;
  model: string;
  developer_instructions: string;
  tools?: unknown;
  model_reasoning_effort?: unknown;
}

let temporaryRoot: string;
let distributionRoot: string;

beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), "qrspi-client-contract-"));
  distributionRoot = join(temporaryRoot, "dist");
  await packageDistributions({ outputRoot: distributionRoot });
});

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe("cross-client contract", () => {
  test("keeps every shipped skill explicitly invoked with harness-specific metadata", async () => {
    for (const skillName of skillNames) {
      const claudeRoot = join(
        distributionRoot,
        "claude",
        ".claude",
        "skills",
        skillName,
      );
      const codexRoot = join(
        distributionRoot,
        "codex",
        ".agents",
        "skills",
        skillName,
      );
      const claude = await readMarkdownFile<SkillFrontmatter>(
        join(claudeRoot, "SKILL.md"),
      );
      const codex = await readMarkdownFile<SkillFrontmatter>(join(codexRoot, "SKILL.md"));
      const openAi = await readYamlFile<OpenAiMetadata>(
        join(codexRoot, "agents", "openai.yaml"),
      );

      expect(claude.attributes.name).toBe(skillName);
      expect(claude.attributes["disable-model-invocation"]).toBe(true);
      expect(await fileExists(claudeRoot, "agents", "openai.yaml")).toBe(false);
      expect(codex.attributes.name).toBe(skillName);
      expect(codex.attributes["disable-model-invocation"]).toBeUndefined();
      expect(codex.body).toBe(claude.body);
      expect(Object.keys(codex.attributes)).toEqual(
        skillName === "setup-qrspi"
          ? ["name", "description"]
          : ["name", "description", "argument-hint"],
      );
      expect(openAi.policy.allow_implicit_invocation).toBe(false);
      expect(openAi.interface.display_name).toBe(
        skillName === "setup-qrspi"
          ? "Setup QRSPI"
          : skillName === "qrspi"
            ? "QRSPI"
          : `QRSPI ${skillName.replace("qrspi-", "").replace(/^./, (letter) => letter.toUpperCase())}`,
      );
      expect(openAi.interface.short_description).toBe(codex.attributes.description);
      expect(openAi.interface.default_prompt).toContain(`/${skillName}`);
      if (skillName === "setup-qrspi") {
        expect(openAi.interface.default_prompt).not.toContain("phase");
      }
    }
  });

  test("ships router scripts and shared resume prose to both clients", async () => {
    for (const [harness, skillRoot] of [
      ["claude", join(distributionRoot, "claude", ".claude", "skills", "qrspi")],
      ["codex", join(distributionRoot, "codex", ".agents", "skills", "qrspi")],
    ] as const) {
      for (const path of [
        "scripts/qrspi.ts",
        "scripts/protocol.ts",
        "scripts/task.ts",
        "scripts/phase.ts",
        "references/task-resume.md",
      ]) {
        expect(await fileExists(skillRoot, ...path.split("/"))).toBe(true);
      }
      expect(await readFile(join(skillRoot, "scripts", "qrspi.ts"), "utf8")).toContain(
        "router --new",
      );
      expect(harness).toBeString();
    }
  });

  test("injects per-harness agent models and emits supported Codex fields", async () => {
    for (const [agentName, expectedModels] of Object.entries(agentModels)) {
      const claude = await readMarkdownFile<{ model: string; tools: string }>(
        join(
          distributionRoot,
          "claude",
          ".claude",
          "agents",
          `${agentName}.md`,
        ),
      );
      const codexPath = join(
        distributionRoot,
        "codex",
        ".codex",
        "agents",
        `${agentName}.toml`,
      );
      const codex = await readTomlFile<CodexAgent>(codexPath);

      expect(claude.attributes.model).toBe(expectedModels.claude);
      expect(claude.attributes.tools).toBeString();
      expect(codex).toMatchObject({ name: agentName, model: expectedModels.codex });
      expect(codex.description).toBeString();
      expect(codex.developer_instructions.length).toBeGreaterThan(0);
      expect(codex.tools).toBeUndefined();
      expect(codex.model_reasoning_effort).toBeUndefined();
      expect(await readFile(codexPath, "utf8")).not.toContain("disable-");
    }
  });
});
