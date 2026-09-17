import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createTestRepository, invokeQrspi, runGit } from "../helpers/repository";

async function createTask(root: string, taskId: string) {
  const result = await invokeQrspi(
    root,
    ["task", "bootstrap", "--input", "-"],
    JSON.stringify({ task_id: taskId, description: `${taskId} description`, references: [] }),
  );
  if (result.exitCode !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout);
}

describe("task resolution", () => {
  test("resolves canonical roots from subdirectories and requires workspace entry", async () => {
    const repository = await createTestRepository();
    try {
      const created = await createTask(repository.root, "resolve-task");
      const mainSubdirectory = join(repository.root, "nested");
      await mkdir(mainSubdirectory);
      const fromMain = await invokeQrspi(mainSubdirectory, [
        "router",
        "--resume",
        "--task-id",
        "resolve-task",
      ]);
      expect(JSON.parse(fromMain.stdout)).toMatchObject({
        kind: "needs_workspace_entry",
        task: {
          main_worktree_root: created.task.main_worktree_root,
          worktree_root: created.task.worktree_root,
        },
      });

      const taskSubdirectory = join(created.task.worktree_root, "nested");
      await mkdir(taskSubdirectory);
      const fromTask = await invokeQrspi(taskSubdirectory, ["router", "--resume"]);
      expect(JSON.parse(fromTask.stdout)).toMatchObject({
        kind: "existing",
        task: { task_id: "resolve-task", current_worktree_root: created.task.worktree_root },
      });
    } finally {
      await repository.cleanup();
    }
  });

  test("sorts valid tasks, ignores ordinary worktrees, and reports managed corruption", async () => {
    const repository = await createTestRepository();
    try {
      await createTask(repository.root, "zeta-task");
      await createTask(repository.root, "alpha-task");
      const ordinary = join(dirname(repository.root), "ordinary");
      expect((await runGit(repository.root, "worktree", "add", "-qb", "ordinary", ordinary, "HEAD")).exitCode).toBe(0);
      const corruptRoot = join(repository.root, ".qrspi", "worktrees", "broken-task");
      expect((await runGit(repository.root, "worktree", "add", "-qb", "broken", corruptRoot, "HEAD")).exitCode).toBe(0);

      const listed = await invokeQrspi(repository.root, ["task", "list"]);
      const inventory = JSON.parse(listed.stdout);
      expect(inventory.tasks.map((task: { task_id: string }) => task.task_id)).toEqual([
        "alpha-task",
        "zeta-task",
      ]);
      expect(inventory.corrupt).toEqual([
        expect.objectContaining({ task_id: "broken-task", code: "marker-missing" }),
      ]);

      const selection = await invokeQrspi(repository.root, ["router", "--resume"]);
      expect(JSON.parse(selection.stdout).kind).toBe("selection_required");
    } finally {
      await repository.cleanup();
    }
  });

  test("rejects exact-record and canonical path mismatches", async () => {
    const repository = await createTestRepository();
    try {
      const malformed = await createTask(repository.root, "malformed-task");
      const malformedMarker = join(malformed.task.task_directory, "task.json");
      const record = JSON.parse(await readFile(malformedMarker, "utf8"));
      await writeFile(malformedMarker, `${JSON.stringify({ ...record, extra: true })}\n`);
      const malformedResult = await invokeQrspi(malformed.task.worktree_root, [
        "router",
        "--resume",
        "--task-id",
        "malformed-task",
      ]);
      expect(JSON.parse(malformedResult.stderr).error.code).toBe("task-record-invalid");

      const mismatch = await createTask(repository.root, "mismatch-task");
      const mismatchMarker = join(mismatch.task.task_directory, "task.json");
      const mismatchRecord = JSON.parse(await readFile(mismatchMarker, "utf8"));
      mismatchRecord.main_worktree_root = mismatch.task.worktree_root;
      await writeFile(mismatchMarker, `${JSON.stringify(mismatchRecord)}\n`);
      const mismatchResult = await invokeQrspi(mismatch.task.worktree_root, [
        "router",
        "--resume",
        "--task-id",
        "mismatch-task",
      ]);
      expect(JSON.parse(mismatchResult.stderr).error.code).toBe("task-path-mismatch");
    } finally {
      await repository.cleanup();
    }
  });

  test("returns bounded inventory when an explicit task is missing", async () => {
    const repository = await createTestRepository();
    try {
      await createTask(repository.root, "available-task");
      const missing = await invokeQrspi(repository.root, [
        "router",
        "--resume",
        "--task-id",
        "missing-task",
      ]);
      expect(missing.exitCode).toBe(2);
      expect(JSON.parse(missing.stderr).error).toMatchObject({
        code: "task-not-found",
        details: { task_id: "missing-task", tasks: [{ task_id: "available-task" }] },
      });
    } finally {
      await repository.cleanup();
    }
  });
});
