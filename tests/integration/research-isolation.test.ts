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

  test("declares questions.md as Research's only input", async () => {
    const { body } = await readMarkdownFile(
      repositoryPath("src", "skills", "qrspi-research", "SKILL.md"),
    );
    const input = section(body, "Input");
    const declaredReads = [...input.matchAll(/^Read `\$ARGUMENTS\/([^`]+)`/gm)].map(
      (match) => match[1],
    );

    expect(declaredReads).toEqual(["questions.md"]);
    expect(input).toContain("That file is your only input");
    expect(input).toMatch(/Do NOT read `task\.md` or any ticket or task description/);
  });

  test("keeps Research descriptive and resolves its agent references", async () => {
    const { body } = await readMarkdownFile(
      repositoryPath("src", "skills", "qrspi-research", "SKILL.md"),
    );

    expect(body).toMatch(/Do NOT suggest improvements, optimizations, or refactoring/);
    expect(body).toMatch(/Do NOT propose implementation approaches or solutions/);

    for (const agent of researchAgents) {
      expect(body).toContain(`**${agent}**`);
      expect(
        await fileExists(repositoryPath("src", "agents", `${agent}.md`)),
      ).toBe(true);
    }
  });
});
