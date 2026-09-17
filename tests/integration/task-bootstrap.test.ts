import { describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestRepository, invokeQrspi, runGit } from "../helpers/repository";

async function bootstrap(
  root: string,
  taskId: string,
  description: string,
  references: Array<{ source: string }> = [],
) {
  return invokeQrspi(
    root,
    ["task", "bootstrap", "--input", "-"],
    JSON.stringify({ task_id: taskId, description, references }),
  );
}

describe("managed task bootstrap", () => {
  test("creates a marker-last worktree with verbatim description and Question admission", async () => {
    const repository = await createTestRepository();
    const referenceRoot = await mkdtemp(join(tmpdir(), "qrspi-reference-"));
    const reference = join(referenceRoot, "context.txt");
    await writeFile(reference, "reference body\n");
    try {
      const prepared = await invokeQrspi(repository.root, [
        "router",
        "--new",
        "--task-id",
        "first-task",
        "--",
        "  preserve this description  ",
      ]);
      expect(prepared.exitCode).toBe(0);
      expect(JSON.parse(prepared.stdout)).toMatchObject({
        kind: "available",
        task_id: "first-task",
        description: "  preserve this description  ",
        branch_name: "qrspi/first-task",
      });

      const created = await bootstrap(
        repository.root,
        "first-task",
        "  preserve this description  ",
        [{ source: reference }, { source: "https://example.invalid/context" }],
      );
      expect(created.exitCode).toBe(0);
      expect(created.stderr).toBe("");
      const envelope = JSON.parse(created.stdout);
      expect(envelope.kind).toBe("bootstrapped");
      expect(envelope.references.map((item: { status: string; reason: string | null }) => [item.status, item.reason])).toEqual([
        ["copied", null],
        ["skipped", "remote-url"],
      ]);

      const taskDirectory = envelope.task.task_directory as string;
      const worktreeRoot = envelope.task.worktree_root as string;
      expect(taskDirectory).toBe(join(worktreeRoot, ".qrspi", "tasks", "current"));
      expect(await readFile(join(taskDirectory, "task.md"), "utf8")).toBe(
        "  preserve this description  \n",
      );
      expect(await readFile(join(taskDirectory, "references", "context.txt"), "utf8")).toBe(
        "reference body\n",
      );
      const markerPath = join(taskDirectory, "task.json");
      expect((await stat(markerPath)).mode & 0o777).toBe(0o600);
      expect(Object.keys(JSON.parse(await readFile(markerPath, "utf8")))).toEqual([
        "task_id",
        "worktree_root",
        "main_worktree_root",
        "task_directory",
        "current_phase",
      ]);

      const entered = await invokeQrspi(worktreeRoot, [
        "phase",
        "enter",
        "--phase",
        "question",
        "--task-id",
        "first-task",
      ]);
      expect(entered.exitCode).toBe(0);
      const entry = JSON.parse(entered.stdout);
      expect(entry.inputs).toEqual([
        { name: "task.md", paths: [join(taskDirectory, "task.md")] },
        { name: "references", paths: [join(taskDirectory, "references", "context.txt")] },
      ]);
      expect(entry.output).toEqual({
        name: "questions.md",
        path: join(taskDirectory, "questions.md"),
      });

      await writeFile(join(taskDirectory, "questions.md"), "# Research Questions\n");
      const accepted = await invokeQrspi(worktreeRoot, [
        "phase",
        "validate",
        "--phase",
        "question",
        "--task-id",
        "first-task",
      ]);
      expect(accepted.exitCode).toBe(0);
      expect(JSON.parse(accepted.stdout)).toMatchObject({
        kind: "accepted",
        phase: "question",
        task: { current_phase: "research", route: { current_phase: "research" } },
        evidence: { kind: "artifact", name: "questions.md" },
      });
    } finally {
      await rm(referenceRoot, { recursive: true, force: true });
      await repository.cleanup();
    }
  });

  test("copies only regular ignored files selected by .worktreeinclude", async () => {
    const repository = await createTestRepository();
    try {
      await writeFile(join(repository.root, ".worktreeinclude"), "included.env\n");
      await writeFile(
        join(repository.root, ".gitignore"),
        "dist/\n/.qrspi/tasks/\n/.qrspi/worktrees/\nincluded.env\nignored.env\n",
      );
      await runGit(repository.root, "add", ".gitignore", ".worktreeinclude");
      await runGit(repository.root, "commit", "-qm", "configure includes");
      await writeFile(join(repository.root, "included.env"), "included\n");
      await writeFile(join(repository.root, "ignored.env"), "not included\n");

      const created = await bootstrap(repository.root, "include-task", "description");
      expect(created.exitCode).toBe(0);
      const worktreeRoot = JSON.parse(created.stdout).task.worktree_root as string;
      expect(await readFile(join(worktreeRoot, "included.env"), "utf8")).toBe("included\n");
      expect(await Bun.file(join(worktreeRoot, "ignored.env")).exists()).toBe(false);
    } finally {
      await repository.cleanup();
    }
  });

  test("rejects setup, tracked dirt, and invalid includes before effects", async () => {
    const unconfigured = await createTestRepository({ configured: false });
    try {
      const result = await bootstrap(unconfigured.root, "blocked", "description");
      expect(result.exitCode).toBe(2);
      expect(JSON.parse(result.stderr).error.code).toBe("setup-required");
      expect(await Bun.file(join(unconfigured.root, ".qrspi", "worktrees", "blocked")).exists()).toBe(false);
    } finally {
      await unconfigured.cleanup();
    }

    const dirty = await createTestRepository();
    try {
      await writeFile(join(dirty.root, "tracked.txt"), "changed\n");
      const result = await bootstrap(dirty.root, "blocked", "description");
      expect(result.exitCode).toBe(2);
      expect(JSON.parse(result.stderr).error.code).toBe("main-worktree-dirty");
    } finally {
      await dirty.cleanup();
    }

    const untrackedIgnore = await createTestRepository();
    try {
      await runGit(untrackedIgnore.root, "rm", "--cached", ".gitignore");
      const result = await bootstrap(untrackedIgnore.root, "blocked", "description");
      expect(result.exitCode).toBe(2);
      expect(JSON.parse(result.stderr).error.code).toBe("gitignore-untracked");
    } finally {
      await untrackedIgnore.cleanup();
    }

    const dirtyIgnore = await createTestRepository();
    try {
      await writeFile(
        join(dirtyIgnore.root, ".gitignore"),
        "dist/\n/.qrspi/tasks/\n/.qrspi/worktrees/\nextra/\n",
      );
      const result = await bootstrap(dirtyIgnore.root, "blocked", "description");
      expect(result.exitCode).toBe(2);
      expect(JSON.parse(result.stderr).error.code).toBe("gitignore-dirty");
    } finally {
      await dirtyIgnore.cleanup();
    }

    const invalidInclude = await createTestRepository();
    try {
      await writeFile(join(invalidInclude.root, ".worktreeinclude"), "selected.env\n");
      await writeFile(
        join(invalidInclude.root, ".gitignore"),
        "dist/\n/.qrspi/tasks/\n/.qrspi/worktrees/\nselected.env\n",
      );
      await runGit(invalidInclude.root, "add", ".gitignore", ".worktreeinclude");
      await runGit(invalidInclude.root, "commit", "-qm", "configure includes");
      await symlink("tracked.txt", join(invalidInclude.root, "selected.env"));
      const result = await bootstrap(invalidInclude.root, "blocked", "description");
      expect(result.exitCode).toBe(2);
      expect(JSON.parse(result.stderr).error.code).toBe("worktree-include-invalid");
      expect(await Bun.file(join(invalidInclude.root, ".qrspi", "worktrees", "blocked")).exists()).toBe(false);
    } finally {
      await invalidInclude.cleanup();
    }
  });

  test("rejects occupied IDs and invalid task IDs", async () => {
    const repository = await createTestRepository();
    try {
      const invalid = await bootstrap(repository.root, "Not-Kebab", "description");
      expect(JSON.parse(invalid.stderr).error.code).toBe("task-id-invalid");
      const oversized = await bootstrap(repository.root, "a".repeat(65), "description");
      expect(JSON.parse(oversized.stderr).error.code).toBe("task-id-invalid");

      expect((await bootstrap(repository.root, "occupied", "description")).exitCode).toBe(0);
      const duplicate = await bootstrap(repository.root, "occupied", "description");
      expect(duplicate.exitCode).toBe(2);
      expect(JSON.parse(duplicate.stderr).error.code).toBe("task-id-occupied");
    } finally {
      await repository.cleanup();
    }
  });

  test("reports every reference independently without rolling back optional failures", async () => {
    const repository = await createTestRepository();
    const referenceRoot = await mkdtemp(join(tmpdir(), "qrspi-reference-results-"));
    try {
      const firstRoot = join(referenceRoot, "first");
      const secondRoot = join(referenceRoot, "second");
      const directorySource = join(referenceRoot, "directory");
      await mkdir(firstRoot);
      await mkdir(secondRoot);
      await mkdir(directorySource);
      const first = join(firstRoot, "same.txt");
      const second = join(secondRoot, "same.txt");
      await writeFile(first, "first\n");
      await writeFile(second, "second\n");
      const missing = join(referenceRoot, "missing.txt");
      const oversized = `/${"x".repeat(4096)}`;
      const created = await bootstrap(repository.root, "reference-results", "description", [
        { source: first },
        { source: first },
        { source: "https://example.invalid/file" },
        { source: "relative.txt" },
        { source: missing },
        { source: directorySource },
        { source: second },
        { source: oversized },
      ]);
      expect(created.exitCode).toBe(0);
      expect(JSON.parse(created.stdout).references.map((item: { status: string; reason: string | null }) => [item.status, item.reason])).toEqual([
        ["copied", null],
        ["skipped", "duplicate-source"],
        ["skipped", "remote-url"],
        ["skipped", "source-not-absolute"],
        ["skipped", "source-missing"],
        ["skipped", "source-not-regular"],
        ["failed", "destination-collision"],
        ["skipped", "source-limit-exceeded"],
      ]);
    } finally {
      await rm(referenceRoot, { recursive: true, force: true });
      await repository.cleanup();
    }
  });

  test("rolls back the exact branch and worktree after a required copy failure", async () => {
    const repository = await createTestRepository();
    try {
      await writeFile(join(repository.root, ".worktreeinclude"), "unreadable.env\n");
      await writeFile(
        join(repository.root, ".gitignore"),
        "dist/\n/.qrspi/tasks/\n/.qrspi/worktrees/\nunreadable.env\n",
      );
      await runGit(repository.root, "add", ".gitignore", ".worktreeinclude");
      await runGit(repository.root, "commit", "-qm", "configure failing include");
      const source = join(repository.root, "unreadable.env");
      await writeFile(source, "secret\n");
      await chmod(source, 0o000);

      const result = await bootstrap(repository.root, "rollback-task", "description");
      expect(result.exitCode).toBe(2);
      expect(JSON.parse(result.stderr).error.code).toBe("worktree-copy-failed");
      expect(await Bun.file(join(repository.root, ".qrspi", "worktrees", "rollback-task")).exists()).toBe(false);
      expect((await runGit(repository.root, "show-ref", "--verify", "--quiet", "refs/heads/qrspi/rollback-task")).exitCode).not.toBe(0);
      await chmod(source, 0o600);
    } finally {
      await repository.cleanup();
    }
  });
});
