import { describe, expect, test } from "bun:test";
import {
  readMarkdownFile,
  readTextFile,
  repositoryPath,
} from "../helpers/repository";

const phaseContracts = {
  "qrspi-question": {
    inputs: ["task.md"],
    outputs: ["questions.md"],
    next: ["qrspi-research"],
  },
  "qrspi-research": {
    inputs: ["questions.md"],
    outputs: ["research.md"],
    next: ["qrspi-design"],
  },
  "qrspi-design": {
    inputs: ["questions.md", "research.md", "task.md"],
    outputs: ["design.md"],
    next: ["qrspi-structure"],
  },
  "qrspi-structure": {
    inputs: ["design.md", "research.md"],
    outputs: ["structure.md"],
    next: ["qrspi-plan"],
  },
  "qrspi-plan": {
    inputs: ["design.md", "research.md", "structure.md"],
    outputs: ["plan.md"],
    next: ["qrspi-implement", "qrspi-worktree"],
  },
  "qrspi-worktree": {
    inputs: [],
    outputs: [],
    next: ["qrspi-implement"],
  },
  "qrspi-implement": {
    inputs: ["plan.md"],
    outputs: ["plan.md"],
    next: ["qrspi-pr"],
  },
  "qrspi-pr": {
    inputs: ["design.md"],
    outputs: [],
    next: [],
  },
} as const;

const phaseNames = Object.keys(phaseContracts);
const artifactPattern = /\b(?:task|questions|research|design|structure|plan)\.md\b/g;
const argumentArtifactPattern =
  /\$ARGUMENTS\/(task|questions|research|design|structure|plan)\.md\b/g;
const commandPattern = /\/(qrspi-[a-z-]+)/g;

function section(markdown: string, heading: string): string {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  if (start === -1) return "";

  const contentStart = start + marker.length;
  const nextHeading = markdown.indexOf("\n## ", contentStart);
  return markdown.slice(contentStart, nextHeading === -1 ? undefined : nextHeading);
}

function uniqueMatches(source: string, pattern: RegExp): string[] {
  return [...new Set(source.match(pattern) ?? [])].sort();
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

      const inputSection = section(body, "Input");
      const inputs = phase === "qrspi-question"
        ? uniqueMatches(inputSection.split(/; the\s+only output/u)[0] ?? "", artifactPattern)
        : [...inputSection.matchAll(argumentArtifactPattern)]
          .map((match) => `${match[1]}.md`)
          .sort();
      const outputs = uniqueMatches(section(body, "Output"), artifactPattern);

      expect(inputs).toEqual([...contract.inputs].sort());
      expect(outputs).toEqual([...contract.outputs].sort());
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
      for (const nextPhase of contract.next) {
        expect(commands).toContain(nextPhase);
      }
      expect(body).not.toMatch(/\/qrspi\/[1-8]_/);
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
    }
  });
});
