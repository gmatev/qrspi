import { describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExecutablePhase } from "../../src/tools/protocol";
import {
  createTestRepository,
  invokeQrspi,
  readMarkdownFile,
  repositoryPath,
} from "../helpers/repository";

const planningOutputs = {
  question: "questions.md",
  research: "research.md",
  design: "design.md",
  structure: "structure.md",
  plan: "plan.md",
} as const;

async function bootstrap(root: string, taskId: string) {
  const result = await invokeQrspi(
    root,
    ["task", "bootstrap", "--input", "-"],
    JSON.stringify({ task_id: taskId, description: `${taskId} description`, references: [] }),
  );
  expect(result.exitCode).toBe(0);
  return JSON.parse(result.stdout);
}

async function phase(
  worktreeRoot: string,
  operation: "enter" | "validate",
  taskId: string,
  phaseName: ExecutablePhase,
) {
  return invokeQrspi(worktreeRoot, [
    "phase",
    operation,
    "--phase",
    phaseName,
    "--task-id",
    taskId,
  ]);
}

async function advanceToPr(
  worktreeRoot: string,
  taskDirectory: string,
  taskId: string,
) {
  for (const [phaseName, output] of Object.entries(planningOutputs)) {
    expect((await phase(
      worktreeRoot,
      "enter",
      taskId,
      phaseName as ExecutablePhase,
    )).exitCode).toBe(0);
    await writeFile(join(taskDirectory, output), `# ${phaseName}\n`);
    expect((await phase(
      worktreeRoot,
      "validate",
      taskId,
      phaseName as ExecutablePhase,
    )).exitCode).toBe(0);
  }
  expect((await phase(worktreeRoot, "validate", taskId, "worktree")).exitCode).toBe(0);
  expect((await phase(worktreeRoot, "validate", taskId, "implement")).exitCode).toBe(0);
}

async function markerPhase(taskDirectory: string): Promise<string> {
  const marker = JSON.parse(await readFile(join(taskDirectory, "task.json"), "utf8"));
  return marker.current_phase as string;
}

describe("pull-request terminal state", () => {
  test("rejects missing, non-regular, malformed, multi-line, and non-HTTPS evidence at pr", async () => {
    const repository = await createTestRepository();
    try {
      const created = await bootstrap(repository.root, "invalid-pr-evidence");
      const worktreeRoot = created.task.worktree_root as string;
      const taskDirectory = created.task.task_directory as string;
      const evidencePath = join(taskDirectory, "pr.md");
      await advanceToPr(worktreeRoot, taskDirectory, "invalid-pr-evidence");

      const entered = await phase(worktreeRoot, "enter", "invalid-pr-evidence", "pr");
      expect(entered.exitCode).toBe(0);
      expect(JSON.parse(entered.stdout)).toMatchObject({
        kind: "entered",
        phase: "pr",
        inputs: [
          { name: "design.md", paths: [join(taskDirectory, "design.md")] },
          { name: "plan.md", paths: [join(taskDirectory, "plan.md")] },
        ],
        output: { name: "pr.md", path: evidencePath },
      });

      const missing = await phase(worktreeRoot, "validate", "invalid-pr-evidence", "pr");
      expect(missing.exitCode).toBe(2);
      expect(JSON.parse(missing.stderr).error.code).toBe("phase-evidence-missing");
      expect(await markerPhase(taskDirectory)).toBe("pr");

      await mkdir(evidencePath);
      const nonRegular = await phase(worktreeRoot, "validate", "invalid-pr-evidence", "pr");
      expect(nonRegular.exitCode).toBe(2);
      expect(JSON.parse(nonRegular.stderr).error.code).toBe("phase-evidence-invalid");
      await rm(evidencePath, { recursive: true });

      for (const source of [
        "",
        "# Pull Request\nhttps://example.test/pull/1\n",
        "# Pull Request\n\nhttp://example.test/pull/1\n",
        "# Pull Request\n\nhttps://example.test\n",
        "# Pull Request\n\nhttps://example.test/pull/1\nextra\n",
        "# Pull Request\n\nhttps://example.test/pull/1\n\n",
      ]) {
        await writeFile(evidencePath, source);
        const rejected = await phase(worktreeRoot, "validate", "invalid-pr-evidence", "pr");
        expect(rejected.exitCode).toBe(2);
        expect(JSON.parse(rejected.stderr).error.code).toBe("phase-evidence-invalid");
        expect(await markerPhase(taskDirectory)).toBe("pr");
      }
    } finally {
      await repository.cleanup();
    }
  });

  test("accepts exact local evidence and resumes terminal state without a remote query", async () => {
    const repository = await createTestRepository();
    try {
      const created = await bootstrap(repository.root, "terminal-pr");
      const worktreeRoot = created.task.worktree_root as string;
      const taskDirectory = created.task.task_directory as string;
      const evidencePath = join(taskDirectory, "pr.md");
      const url = "https://example.test/pull/42";
      await advanceToPr(worktreeRoot, taskDirectory, "terminal-pr");

      await writeFile(evidencePath, `# Pull Request\r\n\r\n${url}\r\n`);
      const accepted = await phase(worktreeRoot, "validate", "terminal-pr", "pr");
      expect(accepted.exitCode).toBe(0);
      expect(JSON.parse(accepted.stdout)).toMatchObject({
        kind: "accepted",
        phase: "pr",
        task: {
          current_phase: "done",
          route: {
            current_phase: "done",
            next_phase: null,
            phase_skill: null,
            resume_command: null,
            phase_command: null,
            pull_request_url: url,
          },
        },
        evidence: {
          kind: "pull_request",
          artifact_path: evidencePath,
          url,
        },
      });
      expect(await markerPhase(taskDirectory)).toBe("done");

      const resumed = await invokeQrspi(worktreeRoot, [
        "router",
        "--resume",
        "--task-id",
        "terminal-pr",
      ]);
      expect(resumed.exitCode).toBe(0);
      expect(JSON.parse(resumed.stdout)).toMatchObject({
        kind: "existing",
        task: {
          current_phase: "done",
          route: {
            pull_request_url: url,
            resume_command: null,
            phase_command: null,
          },
        },
      });
    } finally {
      await repository.cleanup();
    }
  });

  test("does not treat pr.md existence as completion before the marker reaches done", async () => {
    const repository = await createTestRepository();
    try {
      const created = await bootstrap(repository.root, "early-pr-evidence");
      const worktreeRoot = created.task.worktree_root as string;
      const taskDirectory = created.task.task_directory as string;
      await advanceToPr(worktreeRoot, taskDirectory, "early-pr-evidence");

      const markerPath = join(taskDirectory, "task.json");
      const marker = JSON.parse(await readFile(markerPath, "utf8"));
      marker.current_phase = "implement";
      await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
      await writeFile(
        join(taskDirectory, "pr.md"),
        "# Pull Request\n\nhttps://example.test/pull/early\n",
      );

      const resumed = await invokeQrspi(worktreeRoot, [
        "router",
        "--resume",
        "--task-id",
        "early-pr-evidence",
      ]);
      expect(resumed.exitCode).toBe(0);
      expect(JSON.parse(resumed.stdout)).toMatchObject({
        kind: "existing",
        task: {
          current_phase: "implement",
          route: { pull_request_url: null },
        },
      });
    } finally {
      await repository.cleanup();
    }
  });

  test("instructs PR recovery and atomic evidence persistence", async () => {
    const { body } = await readMarkdownFile(
      repositoryPath("src", "skills", "qrspi-pr", "SKILL.md"),
    );
    expect(body).toContain("already has an open pull request");
    expect(body).toContain("reuse and update that pull request");
    expect(body).toContain("unique sibling temporary file");
    expect(body).toContain("rename");
    expect(body).toContain("Only after `pr.md` is durably persisted");
    expect(body).toContain("phase validate --phase pr --task-id <task-id>");
  });
});
