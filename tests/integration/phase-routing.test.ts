import { describe, expect, test } from "bun:test";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRoute } from "../../src/tools/protocol";
import {
  createTestRepository,
  invokeQrspi,
  readMarkdownFile,
  repositoryPath,
} from "../helpers/repository";

type PlanningPhase = "question" | "research" | "design" | "structure" | "plan";

const phaseOutputs = {
  question: "questions.md",
  research: "research.md",
  design: "design.md",
  structure: "structure.md",
  plan: "plan.md",
} as const satisfies Record<PlanningPhase, string>;

const nextPhases = {
  question: "research",
  research: "design",
  design: "structure",
  structure: "plan",
  plan: "implement",
} as const satisfies Record<PlanningPhase, string>;

async function bootstrap(root: string, taskId: string, references: Array<{ source: string }> = []) {
  const result = await invokeQrspi(
    root,
    ["task", "bootstrap", "--input", "-"],
    JSON.stringify({ task_id: taskId, description: `${taskId} description`, references }),
  );
  expect(result.exitCode).toBe(0);
  return JSON.parse(result.stdout);
}

async function enter(worktreeRoot: string, taskId: string, phase: PlanningPhase) {
  return invokeQrspi(worktreeRoot, [
    "phase",
    "enter",
    "--phase",
    phase,
    "--task-id",
    taskId,
  ]);
}

async function validate(worktreeRoot: string, taskId: string, phase: PlanningPhase) {
  return invokeQrspi(worktreeRoot, [
    "phase",
    "validate",
    "--phase",
    phase,
    "--task-id",
    taskId,
  ]);
}

async function advance(
  worktreeRoot: string,
  taskDirectory: string,
  taskId: string,
  phases: readonly PlanningPhase[],
) {
  for (const phase of phases) {
    const entered = await enter(worktreeRoot, taskId, phase);
    expect(entered.exitCode).toBe(0);
    await writeFile(join(taskDirectory, phaseOutputs[phase]), `# ${phase}\n`);
    const accepted = await validate(worktreeRoot, taskId, phase);
    expect(accepted.exitCode).toBe(0);
  }
}

describe("planning phase routing", () => {
  test("returns only allowed absolute paths and advances one phase at a time", async () => {
    const repository = await createTestRepository();
    try {
      const created = await bootstrap(repository.root, "planning-route", [
        { source: join(repository.root, "tracked.txt") },
      ]);
      const worktreeRoot = created.task.worktree_root as string;
      const taskDirectory = created.task.task_directory as string;
      const reference = join(taskDirectory, "references", "tracked.txt");
      const expectedInputs: Record<PlanningPhase, Array<{ name: string; paths: string[] }>> = {
        question: [
          { name: "task.md", paths: [join(taskDirectory, "task.md")] },
          { name: "references", paths: [reference] },
        ],
        research: [{ name: "questions.md", paths: [join(taskDirectory, "questions.md")] }],
        design: [
          { name: "task.md", paths: [join(taskDirectory, "task.md")] },
          { name: "questions.md", paths: [join(taskDirectory, "questions.md")] },
          { name: "research.md", paths: [join(taskDirectory, "research.md")] },
          { name: "references", paths: [reference] },
        ],
        structure: [
          { name: "design.md", paths: [join(taskDirectory, "design.md")] },
          { name: "research.md", paths: [join(taskDirectory, "research.md")] },
        ],
        plan: [
          { name: "structure.md", paths: [join(taskDirectory, "structure.md")] },
          { name: "design.md", paths: [join(taskDirectory, "design.md")] },
          { name: "research.md", paths: [join(taskDirectory, "research.md")] },
        ],
      };

      for (const phase of Object.keys(phaseOutputs) as PlanningPhase[]) {
        const entered = await enter(worktreeRoot, "planning-route", phase);
        expect(entered.exitCode).toBe(0);
        const entry = JSON.parse(entered.stdout);
        expect(entry).toMatchObject({
          kind: "entered",
          phase,
          task: { current_phase: phase },
          inputs: expectedInputs[phase],
          output: {
            name: phaseOutputs[phase],
            path: join(taskDirectory, phaseOutputs[phase]),
          },
        });
        const exposedPaths = entry.inputs.flatMap((input: { paths: string[] }) => input.paths);
        expect(exposedPaths).toEqual(expectedInputs[phase].flatMap((input) => input.paths));
        expect(exposedPaths.every((path: string) => path.startsWith(`${taskDirectory}/`))).toBe(true);

        const rerun = await enter(worktreeRoot, "planning-route", phase);
        expect(rerun.exitCode).toBe(0);
        expect(JSON.parse(rerun.stdout).task.current_phase).toBe(phase);

        await writeFile(join(taskDirectory, phaseOutputs[phase]), `# ${phase}\n`);
        const accepted = await validate(worktreeRoot, "planning-route", phase);
        expect(accepted.exitCode).toBe(0);
        expect(JSON.parse(accepted.stdout)).toMatchObject({
          kind: "accepted",
          phase,
          task: {
            current_phase: nextPhases[phase],
            route: {
              current_phase: nextPhases[phase],
              resume_command: "/qrspi --resume --task-id planning-route",
              phase_command: `/qrspi-${nextPhases[phase]} --task-id planning-route`,
            },
          },
          evidence: {
            kind: "artifact",
            name: phaseOutputs[phase],
            path: join(taskDirectory, phaseOutputs[phase]),
          },
        });
      }

      expect(createRoute("pr", "planning-route")).toMatchObject({
        current_phase: "pr",
        next_phase: "done",
        resume_command: "/qrspi --resume --task-id planning-route",
        phase_command: "/qrspi-pr --task-id planning-route",
      });
    } finally {
      await repository.cleanup();
    }
  });

  test("rewinds earlier phases, retains later artifacts, and rejects forward jumps", async () => {
    const repository = await createTestRepository();
    try {
      const created = await bootstrap(repository.root, "rewind-route");
      const worktreeRoot = created.task.worktree_root as string;
      const taskDirectory = created.task.task_directory as string;
      await advance(worktreeRoot, taskDirectory, "rewind-route", [
        "question",
        "research",
        "design",
        "structure",
      ]);

      const rewound = await enter(worktreeRoot, "rewind-route", "research");
      expect(rewound.exitCode).toBe(0);
      expect(JSON.parse(rewound.stdout)).toMatchObject({
        kind: "entered",
        phase: "research",
        task: { current_phase: "research" },
        inputs: [{ name: "questions.md", paths: [join(taskDirectory, "questions.md")] }],
      });
      expect((await stat(join(taskDirectory, "design.md"))).isFile()).toBe(true);
      expect((await stat(join(taskDirectory, "structure.md"))).isFile()).toBe(true);

      const rerun = await enter(worktreeRoot, "rewind-route", "research");
      expect(rerun.exitCode).toBe(0);
      expect(JSON.parse(rerun.stdout).task.current_phase).toBe("research");

      const forward = await enter(worktreeRoot, "rewind-route", "design");
      expect(forward.exitCode).toBe(2);
      expect(JSON.parse(forward.stderr).error).toMatchObject({
        code: "phase-forward-jump",
        details: { requested: "design", current: "research" },
      });
    } finally {
      await repository.cleanup();
    }
  });

  test("fails closed for missing predecessors, missing evidence, and stale validation", async () => {
    const repository = await createTestRepository();
    try {
      const predecessor = await bootstrap(repository.root, "missing-predecessor");
      const predecessorMarker = join(predecessor.task.task_directory, "task.json");
      const predecessorRecord = JSON.parse(await readFile(predecessorMarker, "utf8"));
      predecessorRecord.current_phase = "research";
      await writeFile(predecessorMarker, `${JSON.stringify(predecessorRecord, null, 2)}\n`);

      const resume = await invokeQrspi(predecessor.task.worktree_root, [
        "router",
        "--resume",
        "--task-id",
        "missing-predecessor",
      ]);
      expect(resume.exitCode).toBe(2);
      expect(JSON.parse(resume.stderr).error).toMatchObject({
        code: "phase-predecessor-missing",
        details: {
          phase: "research",
          path: join(predecessor.task.task_directory, "questions.md"),
        },
      });

      const evidence = await bootstrap(repository.root, "missing-evidence");
      const missing = await validate(evidence.task.worktree_root, "missing-evidence", "question");
      expect(JSON.parse(missing.stderr).error.code).toBe("phase-evidence-missing");
      await mkdir(join(evidence.task.task_directory, "questions.md"));
      const invalid = await validate(evidence.task.worktree_root, "missing-evidence", "question");
      expect(JSON.parse(invalid.stderr).error.code).toBe("phase-evidence-invalid");

      const stale = await bootstrap(repository.root, "stale-validation");
      await writeFile(join(stale.task.task_directory, "questions.md"), "# Questions\n");
      const staleMarker = join(stale.task.task_directory, "task.json");
      const staleRecord = JSON.parse(await readFile(staleMarker, "utf8"));
      staleRecord.current_phase = "research";
      await writeFile(staleMarker, `${JSON.stringify(staleRecord, null, 2)}\n`);
      const rejected = await validate(stale.task.worktree_root, "stale-validation", "question");
      expect(rejected.exitCode).toBe(2);
      expect(JSON.parse(rejected.stderr).error).toMatchObject({
        code: "phase-stale",
        details: { expected: "question", actual: "research" },
      });
    } finally {
      await repository.cleanup();
    }
  });

  test("keeps composed dispatch minimal and all planning skills engine-owned", async () => {
    const router = await readMarkdownFile(repositoryPath("src", "skills", "qrspi", "SKILL.md"));
    const jsonBlocks = [...router.body.matchAll(/```json\s*([\s\S]*?)```/g)]
      .map((match) => match[1])
      .filter((block): block is string => block !== undefined)
      .map((block) => JSON.parse(block.trim()));
    const composed = jsonBlocks.filter((value) => value.composed === true);
    expect(composed.length).toBeGreaterThan(0);
    for (const payload of composed) {
      expect(Object.keys(payload).sort()).toEqual(["composed", "task_directory", "task_id"]);
    }
    expect(router.body).toContain("Dispatch exactly one phase");
    expect(router.body).toContain("engine-selected `<phase-skill>`");

    for (const phase of ["question", "research", "design", "structure", "plan"] as const) {
      const { body, attributes } = await readMarkdownFile<{ "argument-hint": string }>(
        repositoryPath("src", "skills", `qrspi-${phase}`, "SKILL.md"),
      );
      expect(attributes["argument-hint"]).toBe("[--task-id <task-id>]");
      expect(body).toContain("../qrspi/references/task-resume.md");
      expect(body).toContain(`phase enter --phase ${phase} --task-id <task-id>`);
      expect(body).toContain(`phase validate --phase ${phase} --task-id <task-id>`);
      expect(body).not.toContain("$ARGUMENTS");
      expect(body).toContain("/qrspi --resume --task-id <task-id>");
    }
  });
});
