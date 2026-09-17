import { describe, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExecutablePhase } from "../../src/tools/protocol";
import {
  createTestRepository,
  invokeQrspi,
  readMarkdownFile,
  repositoryPath,
  runGit,
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

async function enter(worktreeRoot: string, taskId: string, phase: ExecutablePhase) {
  return invokeQrspi(worktreeRoot, [
    "phase",
    "enter",
    "--phase",
    phase,
    "--task-id",
    taskId,
  ]);
}

async function validate(worktreeRoot: string, taskId: string, phase: ExecutablePhase) {
  return invokeQrspi(worktreeRoot, [
    "phase",
    "validate",
    "--phase",
    phase,
    "--task-id",
    taskId,
  ]);
}

async function advanceThroughPlan(
  worktreeRoot: string,
  taskDirectory: string,
  taskId: string,
) {
  for (const [phase, output] of Object.entries(planningOutputs)) {
    const entered = await enter(worktreeRoot, taskId, phase as ExecutablePhase);
    expect(entered.exitCode).toBe(0);
    await writeFile(join(taskDirectory, output), `# ${phase}\n`);
    const accepted = await validate(worktreeRoot, taskId, phase as ExecutablePhase);
    expect(accepted.exitCode).toBe(0);
  }
}

describe("implementation routing", () => {
  test("advances through readiness and implementation without creating Git state or parsing checkboxes", async () => {
    const repository = await createTestRepository();
    try {
      const created = await bootstrap(repository.root, "implementation-route");
      const worktreeRoot = created.task.worktree_root as string;
      const taskDirectory = created.task.task_directory as string;
      await advanceThroughPlan(worktreeRoot, taskDirectory, "implementation-route");

      const worktreesBefore = await runGit(repository.root, "worktree", "list", "--porcelain");
      const branchesBefore = await runGit(repository.root, "branch", "--format=%(refname)");

      const worktreeEntry = await enter(worktreeRoot, "implementation-route", "worktree");
      expect(worktreeEntry.exitCode).toBe(0);
      expect(JSON.parse(worktreeEntry.stdout)).toMatchObject({
        kind: "entered",
        phase: "worktree",
        inputs: [{ name: "plan.md", paths: [join(taskDirectory, "plan.md")] }],
        output: null,
      });

      const ready = await validate(worktreeRoot, "implementation-route", "worktree");
      expect(ready.exitCode).toBe(0);
      expect(JSON.parse(ready.stdout)).toMatchObject({
        kind: "accepted",
        phase: "worktree",
        task: {
          current_phase: "implement",
          route: {
            phase_command: "/qrspi-implement --task-id implementation-route",
          },
        },
        evidence: { kind: "workspace_ready", worktree_root: worktreeRoot },
      });

      const stale = await validate(worktreeRoot, "implementation-route", "worktree");
      expect(stale.exitCode).toBe(2);
      expect(JSON.parse(stale.stderr).error).toMatchObject({
        code: "phase-stale",
        details: { expected: "worktree", actual: "implement" },
      });

      const worktreesAfter = await runGit(repository.root, "worktree", "list", "--porcelain");
      const branchesAfter = await runGit(repository.root, "branch", "--format=%(refname)");
      expect(worktreesAfter.stdout).toBe(worktreesBefore.stdout);
      expect(branchesAfter.stdout).toBe(branchesBefore.stdout);

      const implementationEntry = await enter(
        worktreeRoot,
        "implementation-route",
        "implement",
      );
      expect(implementationEntry.exitCode).toBe(0);
      expect(JSON.parse(implementationEntry.stdout)).toMatchObject({
        kind: "entered",
        phase: "implement",
        inputs: [{ name: "plan.md", paths: [join(taskDirectory, "plan.md")] }],
        output: null,
      });

      await writeFile(join(taskDirectory, "plan.md"), "# Plan\n\n- [ ] Manual check\n");
      const implemented = await validate(worktreeRoot, "implementation-route", "implement");
      expect(implemented.exitCode).toBe(0);
      expect(JSON.parse(implemented.stdout)).toMatchObject({
        kind: "accepted",
        phase: "implement",
        task: {
          current_phase: "pr",
          route: { phase_command: "/qrspi-pr --task-id implementation-route" },
        },
        evidence: {
          kind: "implementation_complete",
          plan_path: join(taskDirectory, "plan.md"),
        },
      });

      const marker = JSON.parse(await readFile(join(taskDirectory, "task.json"), "utf8"));
      expect(marker.current_phase).toBe("pr");
    } finally {
      await repository.cleanup();
    }
  });

  test("rejects tampered worktree identity without creating or copying anything", async () => {
    const repository = await createTestRepository();
    try {
      const created = await bootstrap(repository.root, "tampered-readiness");
      const worktreeRoot = created.task.worktree_root as string;
      const taskDirectory = created.task.task_directory as string;
      await advanceThroughPlan(worktreeRoot, taskDirectory, "tampered-readiness");

      const markerPath = join(taskDirectory, "task.json");
      const marker = JSON.parse(await readFile(markerPath, "utf8"));
      marker.worktree_root = repository.root;
      await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`);

      const worktreesBefore = await runGit(repository.root, "worktree", "list", "--porcelain");
      const rejected = await validate(worktreeRoot, "tampered-readiness", "worktree");
      expect(rejected.exitCode).toBe(2);
      expect(JSON.parse(rejected.stderr).error.code).toBe("task-path-mismatch");
      const worktreesAfter = await runGit(repository.root, "worktree", "list", "--porcelain");
      expect(worktreesAfter.stdout).toBe(worktreesBefore.stdout);
      expect((await readFile(markerPath, "utf8"))).toContain('"current_phase": "worktree"');
    } finally {
      await repository.cleanup();
    }
  });

  test("ships deterministic Worktree and Implement phase instructions", async () => {
    const worktree = await readMarkdownFile(
      repositoryPath("src", "skills", "qrspi-worktree", "SKILL.md"),
    );
    expect(worktree.body).toContain("phase enter --phase worktree --task-id <task-id>");
    expect(worktree.body).toContain("phase validate --phase worktree --task-id <task-id>");
    expect(worktree.body).not.toContain("git worktree add");
    expect(worktree.body).not.toContain("cp -r");

    const implementation = await readMarkdownFile(
      repositoryPath("src", "skills", "qrspi-implement", "SKILL.md"),
    );
    expect(implementation.body).toContain("phase enter --phase implement --task-id <task-id>");
    expect(implementation.body).toContain("Only after the whole plan is complete");
    expect(implementation.body).toContain("/qrspi-pr --task-id <task-id>");
  });
});
