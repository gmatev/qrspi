import { stat } from "node:fs/promises";
import { join } from "node:path";
import {
  PHASES,
  QrspiError,
  createAcceptedEnvelope,
  createTaskProjection,
  type AcceptedEnvelope,
  type ArtifactInput,
  type ArtifactName,
  type EnteredEnvelope,
  type ExecutablePhase,
  type NeedsWorkspaceEntryEnvelope,
  type Phase,
  type SelectionRequiredEnvelope,
} from "./protocol.ts";
import {
  listReferenceFiles,
  resolveTask,
  taskPaths,
  updateTaskRecord,
  type TaskRequest,
} from "./task.ts";

type ArtifactKey =
  | "task"
  | "references"
  | "questions"
  | "research"
  | "design"
  | "structure"
  | "plan"
  | "pr";

interface PhasePolicy {
  phase: ExecutablePhase;
  previous: ExecutablePhase | null;
  next: Phase;
  inputs: readonly ArtifactKey[];
  output?: ArtifactKey;
}

export const PHASE_POLICY: readonly PhasePolicy[] = [
  { phase: "question", previous: null, next: "research", inputs: ["task", "references"], output: "questions" },
  { phase: "research", previous: "question", next: "design", inputs: ["questions"], output: "research" },
  { phase: "design", previous: "research", next: "structure", inputs: ["task", "questions", "research", "references"], output: "design" },
  { phase: "structure", previous: "design", next: "plan", inputs: ["design", "research"], output: "structure" },
  { phase: "plan", previous: "structure", next: "worktree", inputs: ["structure", "design", "research"], output: "plan" },
  { phase: "worktree", previous: "plan", next: "implement", inputs: ["plan"] },
  { phase: "implement", previous: "worktree", next: "pr", inputs: ["plan"] },
  { phase: "pr", previous: "implement", next: "done", inputs: ["design", "plan"], output: "pr" },
] as const;

const ARTIFACT_NAMES: Readonly<Record<ArtifactKey, ArtifactName>> = {
  task: "task.md",
  references: "references",
  questions: "questions.md",
  research: "research.md",
  design: "design.md",
  structure: "structure.md",
  plan: "plan.md",
  pr: "pr.md",
};

export interface PhaseRequest extends TaskRequest {
  phase: ExecutablePhase;
}

export type PhaseEntryResult = EnteredEnvelope | SelectionRequiredEnvelope | NeedsWorkspaceEntryEnvelope;
export type PhaseValidationResult = AcceptedEnvelope | SelectionRequiredEnvelope | NeedsWorkspaceEntryEnvelope;

function policyFor(phase: ExecutablePhase): PhasePolicy {
  const policy = PHASE_POLICY.find((candidate) => candidate.phase === phase);
  if (policy === undefined) throw new QrspiError("phase-invalid", { phase });
  return policy;
}

async function artifactInputs(
  directory: string,
  policy: PhasePolicy,
): Promise<ArtifactInput[]> {
  const inputs: ArtifactInput[] = [];
  for (const artifact of policy.inputs) {
    const name = ARTIFACT_NAMES[artifact];
    inputs.push({
      name,
      paths: artifact === "references"
        ? await listReferenceFiles(directory)
        : [join(directory, name)],
    });
  }
  return inputs;
}

async function assertPhaseInputs(directory: string, policy: PhasePolicy): Promise<void> {
  for (const artifact of policy.inputs) {
    if (artifact === "references") continue;
    const path = join(directory, ARTIFACT_NAMES[artifact]);
    try {
      const input = await stat(path);
      if (!input.isFile()) throw new Error("not regular");
    } catch {
      throw new QrspiError("phase-predecessor-missing", { phase: policy.phase, path });
    }
  }
}

export async function enterPhase(cwd: string, request: PhaseRequest): Promise<PhaseEntryResult> {
  const resolved = await resolveTask(cwd, { task_id: request.task_id });
  if (resolved.kind !== "existing") return resolved;
  const current = resolved.task.current_phase;
  if (current === "done") throw new QrspiError("phase-complete", { task_id: resolved.task.task_id });
  if (PHASES.indexOf(request.phase) > PHASES.indexOf(current)) {
    throw new QrspiError("phase-forward-jump", { requested: request.phase, current });
  }
  const policy = policyFor(request.phase);
  await assertPhaseInputs(resolved.task.task_directory, policy);
  let task = resolved.task;
  if (request.phase !== current) {
    const rewound = await updateTaskRecord(
      taskPaths.markerPath(resolved.task.worktree_root),
      current,
      request.phase,
    );
    task = createTaskProjection(rewound, resolved.task.current_worktree_root);
  }
  const outputName = policy.output === undefined ? null : ARTIFACT_NAMES[policy.output];
  return {
    kind: "entered",
    task,
    phase: request.phase,
    inputs: await artifactInputs(resolved.task.task_directory, policy),
    output: outputName === null ? null : { name: outputName, path: join(resolved.task.task_directory, outputName) },
  };
}

export async function validatePhase(
  cwd: string,
  request: PhaseRequest,
): Promise<PhaseValidationResult> {
  const resolved = await resolveTask(cwd, { task_id: request.task_id });
  if (resolved.kind !== "existing") return resolved;
  if (resolved.task.current_phase !== request.phase) {
    throw new QrspiError("phase-stale", {
      expected: request.phase,
      actual: resolved.task.current_phase,
    });
  }
  const policy = policyFor(request.phase);
  const outputName = policy.output === undefined ? null : ARTIFACT_NAMES[policy.output];
  if (outputName === null) throw new Error(`phase validation is not implemented for ${request.phase}`);
  const outputPath = join(resolved.task.task_directory, outputName);
  let outputStat;
  try {
    outputStat = await stat(outputPath);
  } catch (error) {
    throw new QrspiError("phase-evidence-missing", { phase: request.phase, path: outputPath });
  }
  if (!outputStat.isFile()) {
    throw new QrspiError("phase-evidence-invalid", { phase: request.phase, path: outputPath });
  }
  const nextRecord = await updateTaskRecord(
    taskPaths.markerPath(resolved.task.worktree_root),
    request.phase,
    policy.next,
  );
  const task = createTaskProjection(nextRecord, resolved.task.current_worktree_root);
  return createAcceptedEnvelope(task, request.phase, {
    kind: "artifact",
    name: outputName,
    path: outputPath,
  });
}
