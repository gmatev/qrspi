import { describe, expect, test } from "bun:test";
import {
  readMarkdownFile,
  readTextFile,
  repositoryPath,
} from "../helpers/repository";

const phaseContracts = {
  "qrspi-question": {
    allowedInput: "`task.md`, `references/*`",
    allowedOutput: "`questions.md`",
    next: "qrspi-research",
  },
  "qrspi-research": {
    allowedInput: "`questions.md` ONLY.",
    allowedOutput: "`research.md`",
    next: "qrspi-design",
  },
  "qrspi-design": {
    allowedInput: "`task.md`, `references/*`, `questions.md`, `research.md`",
    allowedOutput: "`design.md`",
    next: "qrspi-structure",
  },
  "qrspi-structure": {
    allowedInput: "`design.md`, `research.md`",
    allowedOutput: "`structure.md`",
    next: "qrspi-plan",
  },
  "qrspi-plan": {
    allowedInput: "`structure.md`, `design.md`, `research.md`",
    allowedOutput: "`plan.md`",
    next: "qrspi-implement",
  },
  "qrspi-implement": {
    allowedInput: "`plan.md` and repository files named by the active plan slice",
    allowedOutput: "repository changes, plan checkbox updates, and slice commits",
    next: "qrspi-pr",
  },
  "qrspi-pr": {
    allowedInput: "`design.md`, `plan.md`, live Git diff, and commit history",
    allowedOutput: "`pr.md`",
    next: null,
  },
} as const;

const phaseNames = Object.keys(phaseContracts);
const commandPattern = /\/(qrspi-[a-z-]+)/g;

function section(markdown: string, heading: string): string {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  if (start === -1) return "";

  const contentStart = start + marker.length;
  const nextHeading = markdown.indexOf("\n## ", contentStart);
  return markdown.slice(contentStart, nextHeading === -1 ? undefined : nextHeading);
}

function commandReferences(source: string): string[] {
  return [...source.matchAll(commandPattern)].flatMap((match) =>
    match[1] ? [match[1]] : [],
  );
}

describe("workflow contract", () => {
  test("declares the expected artifact inputs and outputs", async () => {
    for (const [phase, contract] of Object.entries(phaseContracts)) {
      const { body } = await readMarkdownFile(
        repositoryPath("src", "skills", phase, "SKILL.md"),
      );

      expect(body).toContain(`Allowed input: ${contract.allowedInput}`);
      expect(body).toContain(`Allowed output: ${contract.allowedOutput}`);
      expect(body).toContain(`phase enter --phase ${phase.replace("qrspi-", "")}`);
      expect(body).toContain(`phase validate --phase ${phase.replace("qrspi-", "")}`);
      expect(section(body, "Input")).toContain(`/${phase} [--task-id <task-id>]`);
    }
  });

  test("uses only shipped commands and preserves forward handoffs", async () => {
    for (const [phase, contract] of Object.entries(phaseContracts)) {
      const { body } = await readMarkdownFile(
        repositoryPath("src", "skills", phase, "SKILL.md"),
      );
      const commands = commandReferences(body);

      for (const command of commands) {
        expect(phaseNames).toContain(command);
      }
      if (contract.next !== null) {
        const output = section(body, "Output");
        expect(output).toContain("/qrspi --resume --task-id <task-id>");
        expect(output).toContain(`/${contract.next} --task-id <task-id>`);
      } else {
        const output = section(body, "Output");
        expect(output).toContain("Phase: done");
        expect(output).not.toContain("/qrspi --resume");
      }
      expect(body).not.toMatch(/\/qrspi\/[1-8]_/);
      expect(body).not.toContain("$qrspi");
    }
  });

  test("keeps Research task-blind and routing engine-owned", async () => {
    const research = await readMarkdownFile(
      repositoryPath("src", "skills", "qrspi-research", "SKILL.md"),
    );

    expect(research.body).toContain("only input");
    expect(research.body).toContain("Do NOT read `task.md`");
    for (const phase of phaseNames) {
      const { body } = await readMarkdownFile(
        repositoryPath("src", "skills", phase, "SKILL.md"),
      );
      expect(body).toContain('bun "<HARNESS_DIR>/tools/qrspi.ts" phase enter');
      expect(body).not.toContain("$ARGUMENTS");
      expect(body).not.toContain("<tasks-directory>");
    }
  });

  test("keeps user and contributor documentation aligned with shipped skills", async () => {
    const readme = await readTextFile(repositoryPath("README.md"));
    const workflowContract = await readTextFile(
      repositoryPath("docs", "development", "workflow-contract.md"),
    );

    for (const document of [readme, workflowContract]) {
      const commands = commandReferences(document);

      for (const command of commands) {
        expect(phaseNames).toContain(command);
      }
      for (const phase of phaseNames) {
        expect(document).toContain(phase);
      }
      expect(document).toContain(".qrspi/tasks/current/");
      expect(document).toContain(".qrspi/worktrees/<task-id>/");
      expect(document).toContain("task.json");
      expect(document).toContain("pr.md");
      expect(document).not.toContain("$qrspi");
    }
  });
});
