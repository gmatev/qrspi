import { describe, expect, test } from "bun:test";
import {
  readMarkdownFile,
  readTextFile,
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

interface SetupFrontmatter {
  name: string;
  "argument-hint"?: string;
}

describe("setup contract", () => {
  test("keeps setup argumentless and preserves its reconciliation contract", async () => {
    const setup = await readMarkdownFile<SetupFrontmatter>(
      repositoryPath("src", "skills", "setup-qrspi", "SKILL.md"),
    );

    expect(setup.attributes.name).toBe("setup-qrspi");
    expect(setup.attributes).not.toHaveProperty("argument-hint");
    expect(setup.body).toContain("This skill takes no arguments");
    expect(setup.body).toContain("`.qrspi/config.json`");
    expect(setup.body).toContain("`.qrspi/tasks/current/`");
    expect(setup.body).not.toContain("`.qrspi/tasks/current/<task-id>/`");
    expect(setup.body).toContain("`.qrspi/worktrees/<task-id>/`");
    expect(setup.body).toContain("Do not read, create, preserve, migrate, warn about, or delete");
    expect(setup.body).toContain("`## QRSPI Configuration`");
    expect(setup.body).toContain(
      "# QRSPI managed tasks\n/.qrspi/tasks/\n/.qrspi/worktrees/",
    );
    expect(setup.body.match(/^\/\.qrspi\/tasks\/$/gmu)).toHaveLength(1);
    expect(setup.body.match(/^\/\.qrspi\/worktrees\/$/gmu)).toHaveLength(1);
    expect(setup.body).not.toContain("tasks_directory");
    expect(setup.body).toMatch(/Show the exact proposed changes.*ask once for confirmation/s);
    expect(setup.body).toMatch(/Write only after the user confirms/s);
  });

  test("aligns user documentation with fixed managed task storage", async () => {
    const readme = await readTextFile(repositoryPath("README.md"));
    const agents = await readTextFile(repositoryPath("AGENTS.md"));

    for (const document of [readme, agents]) {
      expect(document).toContain(".qrspi/tasks/current/");
      expect(document).not.toContain(".qrspi/tasks/current/<task-id>/");
      expect(document).toContain(".qrspi/worktrees/<task-id>/");
      expect(document).not.toContain("tasks_directory");
    }
    expect(readme).toContain("/setup-qrspi");
  });

  test("does not hardcode the former tasks directory in shipped guidance", async () => {
    const sources = [await readTextFile(repositoryPath("README.md"))];
    const formerTasksPrefix = ["thoughts", ""].join("/");

    for (const skill of [...workflowSkills, "setup-qrspi"]) {
      const markdown = await readMarkdownFile(
        repositoryPath("src", "skills", skill, "SKILL.md"),
      );
      sources.push(markdown.body);
    }

    for (const source of sources) {
      expect(source).not.toContain(formerTasksPrefix);
    }
  });
});
