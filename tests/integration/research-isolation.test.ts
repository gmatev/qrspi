import { describe, expect, test } from "bun:test";
import {
  fileExists,
  readMarkdownFile,
  repositoryPath,
} from "../helpers/repository";

const researchAgents = [
  "codebase-analyzer",
  "codebase-locator",
  "codebase-pattern-finder",
];

function section(markdown: string, heading: string): string {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  if (start === -1) return "";

  const contentStart = start + marker.length;
  const nextHeading = markdown.indexOf("\n## ", contentStart);
  return markdown.slice(contentStart, nextHeading === -1 ? undefined : nextHeading);
}

describe("research isolation", () => {
  test("keeps task context out of the research questions", async () => {
    const { body } = await readMarkdownFile(
      repositoryPath("src", "skills", "qrspi-question", "SKILL.md"),
    );

    expect(body).toMatch(
      /`questions\.md` must NOT contain the task description, goals, or desired behavior/,
    );
    expect(body).toMatch(/researcher.*should have no idea what feature is being built/i);
  });

  test("uses only the engine-returned questions.md path", async () => {
    const { body } = await readMarkdownFile(
      repositoryPath("src", "skills", "qrspi-research", "SKILL.md"),
    );
    const input = section(body, "Input");
    const entry = section(body, "Entry");

    expect(entry).toContain("phase enter --phase research --task-id <task-id>");
    expect(entry).toContain("Read the returned `questions.md` fully");
    expect(entry).toMatch(/That file is\s+your only input/);
    expect(body).not.toContain("$ARGUMENTS");
  });

  test("keeps task context out of Research inputs and delegated prompts", async () => {
    const { body } = await readMarkdownFile(
      repositoryPath("src", "skills", "qrspi-research", "SKILL.md"),
    );
    const input = section(body, "Input");
    const process = section(body, "Process");

    expect(input).not.toMatch(/task\.md|task description|copied references|desired state|design intent/i);
    expect(process).not.toMatch(/task\.md|task description|copied references|desired state|design intent|recommendations?/i);
    expect(body).toMatch(/Do NOT read `task\.md` or any ticket or task description/);
    expect(body).toMatch(/Do NOT suggest improvements, optimizations, or refactoring/);
    expect(body).toMatch(/Do NOT propose implementation approaches or solutions/);
    expect(body).toMatch(/"Describe what\s+exists\. Do not suggest improvements or propose solutions\."/);

    for (const agent of researchAgents) {
      expect(body).toContain(`**${agent}**`);
      expect(
        await fileExists(repositoryPath("src", "agents", `${agent}.md`)),
      ).toBe(true);
    }
  });
});
