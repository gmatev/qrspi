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

  test("ships shared tools, hooks, and resume prose to both clients", async () => {
    for (const [harness, harnessRoot, skillRoot] of [
      ["claude", join(distributionRoot, "claude", ".claude"), join(distributionRoot, "claude", ".claude", "skills", "qrspi")],
      ["codex", join(distributionRoot, "codex", ".codex"), join(distributionRoot, "codex", ".agents", "skills", "qrspi")],
    ] as const) {
      for (const path of [
        "tools/qrspi.ts",
        "tools/protocol.ts",
        "tools/task.ts",
        "tools/phase.ts",
        "hooks/qrspi-context.ts",
      ]) {
        expect(await fileExists(harnessRoot, ...path.split("/"))).toBe(true);
      }
      expect(await fileExists(skillRoot, "references", "task-resume.md")).toBe(true);
      expect(await fileExists(skillRoot, "scripts")).toBe(false);
      expect(await readFile(join(harnessRoot, "tools", "qrspi.ts"), "utf8")).toContain(
        "router --new",
      );
      expect(harness).toBeString();
    }
  });

  test("keeps runtime location hook-injected and outside skill ownership", async () => {
    for (const skillName of skillNames) {
      const skill = await readMarkdownFile(
        join(distributionRoot, "claude", ".claude", "skills", skillName, "SKILL.md"),
      );
      expect(skill.body).not.toContain("../qrspi/scripts");
      expect(skill.body).not.toMatch(/HARNESS_DIR\s*=/u);
      for (const line of skill.body.split("\n").filter((line) => line.includes("<HARNESS_DIR>"))) {
        expect(line).toContain('bun "<HARNESS_DIR>/tools/qrspi.ts"');
      }
    }

    const router = await readMarkdownFile(
      join(distributionRoot, "claude", ".claude", "skills", "qrspi", "SKILL.md"),
    );
    const resume = await readFile(
      join(
        distributionRoot,
        "claude",
        ".claude",
        "skills",
        "qrspi",
        "references",
        "task-resume.md",
      ),
      "utf8",
    );
    const question = await readMarkdownFile(
      join(distributionRoot, "claude", ".claude", "skills", "qrspi-question", "SKILL.md"),
    );
    for (const source of [router.body, resume, question.body]) {
      expect(source).toContain('bun "<HARNESS_DIR>/tools/qrspi.ts"');
      expect(source).not.toContain("git rev-parse --show-toplevel");
      for (const line of source.split("\n").filter((line) => line.includes("<HARNESS_DIR>"))) {
        expect(line).toContain('bun "<HARNESS_DIR>/tools/qrspi.ts"');
      }
    }
  });

  test("resolves the Codex hook command from the Git root", async () => {
    const configuration = JSON.parse(
      await readFile(join(distributionRoot, "codex", ".codex", "hooks.json"), "utf8"),
    );
    expect(configuration.hooks.SessionStart[0].hooks[0].command).toBe(
      'bun "$(git rev-parse --show-toplevel)/.codex/hooks/qrspi-context.ts" codex',
    );
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
