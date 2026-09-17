import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ERROR_MESSAGES,
  ERROR_DETAIL_KEYS,
  LIMITS,
  PHASES,
  QrspiError,
  createAcceptedEnvelope,
  createReferenceResult,
  createRoute,
  createTaskProjection,
  serializeFailure,
  serializeJson,
  utf8Bytes,
  type ErrorCode,
  type ErrorDetailsByCode,
  type ExecutablePhase,
  type TaskRecord,
} from "../../src/skills/qrspi/scripts/protocol";
import { repositoryPath } from "../helpers/repository";

const directory = repositoryPath("tests", "fixtures", "protocol");
const baseRecord: TaskRecord = {
  task_id: "alpha",
  worktree_root: "/repo/.qrspi/worktrees/alpha",
  main_worktree_root: "/repo",
  task_directory: "/repo/.qrspi/worktrees/alpha/.qrspi/tasks/current/alpha",
  current_phase: "question",
};
const inTask = "/repo/.qrspi/worktrees/alpha";

async function expectGolden(name: string, value: unknown) {
  expect(serializeJson(value)).toBe(await readFile(join(directory, `${name}.json`), "utf8"));
}

const inventory = {
  tasks: [{
    task_id: "alpha",
    worktree_root: baseRecord.worktree_root,
    task_directory: baseRecord.task_directory,
    current_phase: "question" as const,
  }],
  corrupt: [],
  tasks_truncated: false,
  corrupt_truncated: false,
};

describe("protocol golden documents", () => {
  test("serializes every Slice 1 success envelope with stable nulls and order", async () => {
    const task = createTaskProjection(baseRecord, inTask);
    await expectGolden("available", {
      kind: "available",
      task_id: "alpha",
      description: "Build alpha",
      branch_name: "qrspi/alpha",
      current_worktree_root: "/repo",
      main_worktree_root: "/repo",
      worktree_root: baseRecord.worktree_root,
      task_directory: baseRecord.task_directory,
    });
    await expectGolden("existing", { kind: "existing", task });
    await expectGolden("bootstrapped", {
      kind: "bootstrapped",
      task: createTaskProjection(baseRecord, "/repo"),
      references: [
        createReferenceResult({
          source: "/input/a.txt",
          destination: `${baseRecord.task_directory}/references/a.txt`,
          status: "copied",
          reason: null,
        }),
        createReferenceResult({
          source: "https://example.invalid/a",
          destination: null,
          status: "skipped",
          reason: "remote-url",
        }),
        createReferenceResult({
          source: "/input/other/a.txt",
          destination: `${baseRecord.task_directory}/references/a.txt`,
          status: "failed",
          reason: "destination-collision",
        }),
      ],
      workspace_entry: {
        required: true,
        worktree_root: baseRecord.worktree_root,
        continuation_command: "/qrspi --resume --task-id alpha",
      },
    });
    await expectGolden("selection-required", {
      kind: "selection_required",
      tasks: inventory.tasks,
      corrupt: [{
        task_id: "broken",
        worktree_root: "/repo/.qrspi/worktrees/broken",
        marker_path: "/repo/.qrspi/worktrees/broken/.qrspi/tasks/current/broken/task.json",
        code: "marker-missing",
      }],
      tasks_truncated: false,
      corrupt_truncated: true,
    });
    await expectGolden("needs-workspace-entry", {
      kind: "needs_workspace_entry",
      task: createTaskProjection(baseRecord, "/repo"),
      workspace_entry: {
        required: true,
        worktree_root: baseRecord.worktree_root,
        continuation_command: "/qrspi --resume --task-id alpha",
      },
    });
    await expectGolden("entered", {
      kind: "entered",
      task,
      phase: "question",
      inputs: [
        { name: "task.md", paths: [`${baseRecord.task_directory}/task.md`] },
        { name: "references", paths: [] },
      ],
      output: { name: "questions.md", path: `${baseRecord.task_directory}/questions.md` },
    });
    const acceptedRecord = { ...baseRecord, current_phase: "research" as const };
    await expectGolden("accepted", createAcceptedEnvelope(
      createTaskProjection(acceptedRecord, inTask),
      "question",
      { kind: "artifact", name: "questions.md", path: `${baseRecord.task_directory}/questions.md` },
    ));
    await expectGolden("task-list", inventory);
  });

  test("derives executable and terminal routes with all required fields", () => {
    for (const phase of PHASES.slice(0, -1) as readonly ExecutablePhase[]) {
      const route = createRoute(phase, "alpha");
      expect(route.current_phase).toBe(phase);
      expect(route.next_phase).not.toBeNull();
      expect(route.phase_skill).toBe(`qrspi-${phase}`);
      expect(route.resume_command).toBe("/qrspi --resume --task-id alpha");
      expect(route.phase_command).toBe(`/qrspi-${phase} --task-id alpha`);
      expect(route.pull_request_url).toBeNull();
    }
    expect(createRoute("done", "alpha", "https://example.invalid/pr/1")).toEqual({
      current_phase: "done",
      next_phase: null,
      phase_skill: null,
      resume_command: null,
      phase_command: null,
      pull_request_url: "https://example.invalid/pr/1",
    });
  });

  test("enforces reference and accepted-evidence invariants", () => {
    expect(() => createReferenceResult({ source: "x", destination: null, status: "copied", reason: null })).toThrow();
    expect(() => createReferenceResult({ source: "x", destination: null, status: "failed", reason: null })).toThrow();
    const task = createTaskProjection(baseRecord, inTask);
    expect(() => createAcceptedEnvelope(task, "question", { kind: "workspace_ready", worktree_root: inTask })).toThrow();
    expect(createAcceptedEnvelope(task, "worktree", { kind: "workspace_ready", worktree_root: inTask }).evidence.kind).toBe("workspace_ready");
    expect(createAcceptedEnvelope(task, "implement", { kind: "implementation_complete", plan_path: "/repo/plan.md" }).evidence.kind).toBe("implementation_complete");
    expect(createAcceptedEnvelope(task, "pr", { kind: "pull_request", artifact_path: "/repo/pr.md", url: "https://example.invalid/pr/1" }).evidence.kind).toBe("pull_request");
  });
});

const detailsByCode = {
  "usage-error": { command: null },
  "stdin-invalid": { reason: "shape" },
  "description-required": {},
  "input-limit-exceeded": { field: "description", limit: LIMITS.description_bytes },
  "repository-not-found": { cwd: "/repo" },
  "repository-topology-invalid": { cwd: "/repo" },
  "setup-required": { main_worktree_root: "/repo", missing: ["/.qrspi/tasks/"] },
  "gitignore-untracked": { path: "/repo/.gitignore" },
  "gitignore-dirty": { path: "/repo/.gitignore" },
  "main-worktree-dirty": { main_worktree_root: "/repo" },
  "task-id-invalid": { task_id: "INVALID" },
  "task-id-occupied": { task_id: "alpha", collisions: ["branch:qrspi/alpha"] },
  "task-not-found": { task_id: "alpha", tasks: [], corrupt: [], truncated: false },
  "task-record-invalid": { marker_path: "/repo/task.json", reason: "shape" },
  "task-path-mismatch": { marker_path: "/repo/task.json", field: "worktree_root", expected: "/repo/a", actual: "/repo/b" },
  "task-duplicate": { task_id: "alpha", worktree_roots: ["/repo/a", "/repo/b"] },
  "task-incomplete": { task_id: "alpha", worktree_root: "/repo/a", marker_path: "/repo/a/task.json" },
  "task-description-invalid": { path: "/repo/task.md" },
  "worktree-include-invalid": { path: "/repo/.worktreeinclude" },
  "worktree-add-failed": { task_id: "alpha", worktree_root: "/repo/a" },
  "worktree-copy-failed": { source: "/repo/a", destination: "/repo/b" },
  "task-write-failed": { path: "/repo/task.json" },
  "git-command-failed": { operation: "status" },
  "phase-invalid": { phase: "unknown" },
  "phase-complete": { task_id: "alpha" },
  "phase-forward-jump": { requested: "research", current: "question" },
  "phase-stale": { expected: "question", actual: "research" },
  "phase-predecessor-missing": { phase: "research", path: "/repo/questions.md" },
  "phase-evidence-missing": { phase: "question", path: "/repo/questions.md" },
  "phase-evidence-invalid": { phase: "pr", path: "/repo/pr.md" },
  "internal-error": { operation: "dispatch" },
} satisfies { [C in ErrorCode]: ErrorDetailsByCode[C] };

describe("failure protocol", () => {
  test("registers and serializes every error code with fixed messages", async () => {
    expect(Object.keys(detailsByCode).sort()).toEqual(Object.keys(ERROR_MESSAGES).sort());
    for (const code of Object.keys(detailsByCode) as ErrorCode[]) {
      const expectedKeys: string[] = [...ERROR_DETAIL_KEYS[code]];
      expect(expectedKeys.sort()).toEqual(Object.keys(detailsByCode[code]).sort());
      const document = serializeFailure(new QrspiError(code, detailsByCode[code]));
      const parsed = JSON.parse(document);
      expect(parsed.error.code).toBe(code);
      expect(parsed.error.message).toBe(ERROR_MESSAGES[code]);
      expect(Object.keys(parsed.error.details).sort()).toEqual(Object.keys(detailsByCode[code]).sort());
      expect(utf8Bytes(document)).toBeLessThanOrEqual(LIMITS.failure_document_bytes);
    }
    await expectGolden("failures", {
      error: { code: "usage-error", message: ERROR_MESSAGES["usage-error"], details: { command: null } },
    });
    expect(() => new QrspiError("unregistered" as ErrorCode, {} as never)).toThrow(
      "invalid QRSPI error registration",
    );
    expect(() => new QrspiError("usage-error", { command: null, extra: true } as never)).toThrow(
      "invalid QRSPI error registration",
    );
  });

  test("measures public limits as UTF-8 bytes", () => {
    expect(utf8Bytes("a".repeat(LIMITS.path_bytes))).toBe(LIMITS.path_bytes);
    expect(utf8Bytes("é".repeat(LIMITS.path_bytes))).toBe(LIMITS.path_bytes * 2);
  });
});
