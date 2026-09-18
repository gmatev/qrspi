export const PHASES = [
  "question",
  "research",
  "design",
  "structure",
  "plan",
  "worktree",
  "implement",
  "pr",
  "done",
] as const;

export type Phase = (typeof PHASES)[number];
export type ExecutablePhase = Exclude<Phase, "done">;
export type PhaseSkill = `qrspi-${ExecutablePhase}`;

export type ArtifactName =
  | "task.md"
  | "references"
  | "questions.md"
  | "research.md"
  | "design.md"
  | "structure.md"
  | "plan.md"
  | "pr.md";

export interface TaskRecord {
  task_id: string;
  worktree_root: string;
  main_worktree_root: string;
  task_directory: string;
  current_phase: Phase;
}

export interface RouteProjection {
  current_phase: Phase;
  next_phase: Phase | null;
  phase_skill: PhaseSkill | null;
  resume_command: string | null;
  phase_command: string | null;
  pull_request_url: string | null;
}

export interface TaskProjection extends TaskRecord {
  current_worktree_root: string;
  route: RouteProjection;
}

export interface TaskListEntry {
  task_id: string;
  worktree_root: string;
  task_directory: string;
  current_phase: Phase;
}

export type CorruptTaskCode =
  | "marker-missing"
  | "record-invalid"
  | "path-mismatch"
  | "description-invalid";

export interface CorruptTaskEntry {
  task_id: string | null;
  worktree_root: string;
  marker_path: string;
  code: CorruptTaskCode;
}

export interface TaskInventory {
  tasks: TaskListEntry[];
  corrupt: CorruptTaskEntry[];
  tasks_truncated: boolean;
  corrupt_truncated: boolean;
}

export type ReferenceReason =
  | "remote-url"
  | "duplicate-source"
  | "source-limit-exceeded"
  | "source-not-absolute"
  | "source-missing"
  | "source-not-regular"
  | "destination-collision"
  | "copy-failed";

export interface ReferenceResult {
  source: string;
  destination: string | null;
  status: "copied" | "skipped" | "failed";
  reason: ReferenceReason | null;
}

export interface AvailableEnvelope {
  kind: "available";
  task_id: string;
  description: string;
  branch_name: string;
  current_worktree_root: string;
  main_worktree_root: string;
  worktree_root: string;
  task_directory: string;
}

export interface ExistingEnvelope {
  kind: "existing";
  task: TaskProjection;
}

export interface WorkspaceEntryProjection {
  required: true;
  worktree_root: string;
  continuation_command: string;
}

export interface BootstrappedEnvelope {
  kind: "bootstrapped";
  task: TaskProjection;
  references: ReferenceResult[];
  workspace_entry: WorkspaceEntryProjection;
}

export interface SelectionRequiredEnvelope extends TaskInventory {
  kind: "selection_required";
}

export interface NeedsWorkspaceEntryEnvelope {
  kind: "needs_workspace_entry";
  task: TaskProjection;
  workspace_entry: WorkspaceEntryProjection;
}

export interface ArtifactInput {
  name: ArtifactName;
  paths: string[];
}

export interface ArtifactOutput {
  name: ArtifactName;
  path: string;
}

export interface EnteredEnvelope {
  kind: "entered";
  task: TaskProjection;
  phase: ExecutablePhase;
  inputs: ArtifactInput[];
  output: ArtifactOutput | null;
}

export type AcceptedEvidence =
  | { kind: "artifact"; name: ArtifactName; path: string }
  | { kind: "workspace_ready"; worktree_root: string }
  | { kind: "implementation_complete"; plan_path: string }
  | { kind: "pull_request"; artifact_path: string; url: string };

export interface AcceptedEnvelope {
  kind: "accepted";
  task: TaskProjection;
  phase: ExecutablePhase;
  evidence: AcceptedEvidence;
}

export type TaskListResponse = TaskInventory;

export type SuccessEnvelope =
  | AvailableEnvelope
  | ExistingEnvelope
  | BootstrappedEnvelope
  | SelectionRequiredEnvelope
  | NeedsWorkspaceEntryEnvelope
  | EnteredEnvelope
  | AcceptedEnvelope;

export const LIMITS = {
  task_id_characters: 64,
  description_bytes: 65_536,
  path_bytes: 4_096,
  references: 100,
  inventory_tasks: 100,
  inventory_corrupt: 100,
  error_inventory_tasks: 25,
  error_inventory_corrupt: 25,
  error_message_bytes: 512,
  error_details_bytes: 65_536,
  failure_document_bytes: 66_560,
} as const;

export type ErrorCode =
  | "usage-error"
  | "stdin-invalid"
  | "description-required"
  | "input-limit-exceeded"
  | "repository-not-found"
  | "repository-topology-invalid"
  | "setup-required"
  | "task-id-invalid"
  | "task-id-occupied"
  | "task-not-found"
  | "task-record-invalid"
  | "task-path-mismatch"
  | "task-duplicate"
  | "task-incomplete"
  | "task-description-invalid"
  | "worktree-include-invalid"
  | "worktree-add-failed"
  | "worktree-copy-failed"
  | "task-write-failed"
  | "git-command-failed"
  | "phase-invalid"
  | "phase-complete"
  | "phase-forward-jump"
  | "phase-stale"
  | "phase-predecessor-missing"
  | "phase-evidence-missing"
  | "phase-evidence-invalid"
  | "internal-error";

export interface ErrorDetailsByCode {
  "usage-error": { command: string | null };
  "stdin-invalid": { reason: "empty" | "malformed" | "trailing" | "shape" };
  "description-required": Record<string, never>;
  "input-limit-exceeded": { field: string; limit: number };
  "repository-not-found": { cwd: string };
  "repository-topology-invalid": { cwd: string };
  "setup-required": { main_worktree_root: string; missing: string[] };
  "task-id-invalid": { task_id: string };
  "task-id-occupied": { task_id: string; collisions: string[] };
  "task-not-found": {
    task_id: string;
    tasks: TaskListEntry[];
    corrupt: CorruptTaskEntry[];
    truncated: boolean;
  };
  "task-record-invalid": {
    marker_path: string;
    reason: "json" | "shape" | "task-id" | "phase" | "path";
  };
  "task-path-mismatch": {
    marker_path: string;
    field: string;
    expected: string;
    actual: string;
  };
  "task-duplicate": { task_id: string; worktree_roots: string[] };
  "task-incomplete": { task_id: string; worktree_root: string; marker_path: string };
  "task-description-invalid": { path: string };
  "worktree-include-invalid": { path: string };
  "worktree-add-failed": { task_id: string; worktree_root: string };
  "worktree-copy-failed": { source: string; destination: string };
  "task-write-failed": { path: string };
  "git-command-failed": { operation: string };
  "phase-invalid": { phase: string };
  "phase-complete": { task_id: string };
  "phase-forward-jump": { requested: ExecutablePhase; current: Phase };
  "phase-stale": { expected: ExecutablePhase; actual: Phase };
  "phase-predecessor-missing": { phase: ExecutablePhase; path: string };
  "phase-evidence-missing": { phase: ExecutablePhase; path: string };
  "phase-evidence-invalid": { phase: ExecutablePhase; path: string };
  "internal-error": { operation: string };
}

export type FailureEnvelope = {
  [C in ErrorCode]: {
    error: { code: C; message: string; details: ErrorDetailsByCode[C] };
  };
}[ErrorCode];

export const ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  "usage-error": "The command syntax is invalid.",
  "stdin-invalid": "Standard input is invalid.",
  "description-required": "A task description is required.",
  "input-limit-exceeded": "An input exceeds its allowed limit.",
  "repository-not-found": "The current directory is not inside a Git worktree.",
  "repository-topology-invalid": "The Git worktree topology is invalid.",
  "setup-required": "QRSPI repository setup is required.",
  "task-id-invalid": "The task ID is invalid.",
  "task-id-occupied": "The task ID is already occupied.",
  "task-not-found": "The requested task was not found.",
  "task-record-invalid": "The task record is invalid.",
  "task-path-mismatch": "The task record does not match repository topology.",
  "task-duplicate": "More than one task has the requested ID.",
  "task-incomplete": "The managed task is incomplete.",
  "task-description-invalid": "The task description is invalid.",
  "worktree-include-invalid": "The worktree include file is invalid.",
  "worktree-add-failed": "The managed worktree could not be created.",
  "worktree-copy-failed": "A required worktree file could not be copied.",
  "task-write-failed": "A required task file could not be written.",
  "git-command-failed": "A required Git operation failed.",
  "phase-invalid": "The requested phase is invalid.",
  "phase-complete": "The task is already complete.",
  "phase-forward-jump": "The requested phase is ahead of the task frontier.",
  "phase-stale": "The task phase changed before validation completed.",
  "phase-predecessor-missing": "A required predecessor artifact is missing.",
  "phase-evidence-missing": "The expected phase evidence is missing.",
  "phase-evidence-invalid": "The phase evidence is invalid.",
  "internal-error": "An unexpected internal operation failed.",
};

export const ERROR_DETAIL_KEYS = {
  "usage-error": ["command"],
  "stdin-invalid": ["reason"],
  "description-required": [],
  "input-limit-exceeded": ["field", "limit"],
  "repository-not-found": ["cwd"],
  "repository-topology-invalid": ["cwd"],
  "setup-required": ["main_worktree_root", "missing"],
  "task-id-invalid": ["task_id"],
  "task-id-occupied": ["task_id", "collisions"],
  "task-not-found": ["task_id", "tasks", "corrupt", "truncated"],
  "task-record-invalid": ["marker_path", "reason"],
  "task-path-mismatch": ["marker_path", "field", "expected", "actual"],
  "task-duplicate": ["task_id", "worktree_roots"],
  "task-incomplete": ["task_id", "worktree_root", "marker_path"],
  "task-description-invalid": ["path"],
  "worktree-include-invalid": ["path"],
  "worktree-add-failed": ["task_id", "worktree_root"],
  "worktree-copy-failed": ["source", "destination"],
  "task-write-failed": ["path"],
  "git-command-failed": ["operation"],
  "phase-invalid": ["phase"],
  "phase-complete": ["task_id"],
  "phase-forward-jump": ["requested", "current"],
  "phase-stale": ["expected", "actual"],
  "phase-predecessor-missing": ["phase", "path"],
  "phase-evidence-missing": ["phase", "path"],
  "phase-evidence-invalid": ["phase", "path"],
  "internal-error": ["operation"],
} as const satisfies Record<ErrorCode, readonly string[]>;

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && Object.hasOwn(ERROR_MESSAGES, value);
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validTaskListEntry(value: unknown): value is TaskListEntry {
  return isExactRecord(value, ["task_id", "worktree_root", "task_directory", "current_phase"]) &&
    typeof value.task_id === "string" &&
    typeof value.worktree_root === "string" &&
    typeof value.task_directory === "string" &&
    isPhase(value.current_phase);
}

function validCorruptTaskEntry(value: unknown): value is CorruptTaskEntry {
  return isExactRecord(value, ["task_id", "worktree_root", "marker_path", "code"]) &&
    (typeof value.task_id === "string" || value.task_id === null) &&
    typeof value.worktree_root === "string" &&
    typeof value.marker_path === "string" &&
    typeof value.code === "string" &&
    (["marker-missing", "record-invalid", "path-mismatch", "description-invalid"] as const).includes(
      value.code as CorruptTaskCode,
    );
}

function validErrorDetails<C extends ErrorCode>(code: C, details: unknown): details is ErrorDetailsByCode[C] {
  if (!isExactRecord(details, ERROR_DETAIL_KEYS[code])) return false;
  const stringAt = (key: string) => typeof details[key] === "string";
  switch (code) {
    case "usage-error":
      return stringAt("command") || details.command === null;
    case "stdin-invalid":
      return ["empty", "malformed", "trailing", "shape"].includes(details.reason as string);
    case "description-required":
      return true;
    case "input-limit-exceeded":
      return stringAt("field") && typeof details.limit === "number" && Number.isFinite(details.limit);
    case "repository-not-found":
    case "repository-topology-invalid":
      return stringAt("cwd");
    case "setup-required":
      return stringAt("main_worktree_root") && strings(details.missing);
    case "task-description-invalid":
    case "worktree-include-invalid":
    case "task-write-failed":
      return stringAt("path");
    case "task-id-invalid":
    case "phase-complete":
      return stringAt("task_id");
    case "task-id-occupied":
      return stringAt("task_id") && strings(details.collisions);
    case "task-not-found":
      return stringAt("task_id") &&
        Array.isArray(details.tasks) && details.tasks.every(validTaskListEntry) &&
        Array.isArray(details.corrupt) && details.corrupt.every(validCorruptTaskEntry) &&
        typeof details.truncated === "boolean";
    case "task-record-invalid":
      return stringAt("marker_path") && ["json", "shape", "task-id", "phase", "path"].includes(details.reason as string);
    case "task-path-mismatch":
      return stringAt("marker_path") && stringAt("field") && stringAt("expected") && stringAt("actual");
    case "task-duplicate":
      return stringAt("task_id") && strings(details.worktree_roots);
    case "task-incomplete":
      return stringAt("task_id") && stringAt("worktree_root") && stringAt("marker_path");
    case "worktree-add-failed":
      return stringAt("task_id") && stringAt("worktree_root");
    case "worktree-copy-failed":
      return stringAt("source") && stringAt("destination");
    case "git-command-failed":
    case "internal-error":
      return stringAt("operation");
    case "phase-invalid":
      return stringAt("phase");
    case "phase-forward-jump":
      return isExecutablePhase(details.requested) && isPhase(details.current);
    case "phase-stale":
      return isExecutablePhase(details.expected) && isPhase(details.actual);
    case "phase-predecessor-missing":
    case "phase-evidence-missing":
    case "phase-evidence-invalid":
      return isExecutablePhase(details.phase) && stringAt("path");
  }
}

export class QrspiError<C extends ErrorCode> extends Error {
  readonly code: C;
  readonly details: ErrorDetailsByCode[C];

  constructor(code: C, details: ErrorDetailsByCode[C]) {
    if (!isErrorCode(code) || !validErrorDetails(code, details)) {
      throw new Error("invalid QRSPI error registration");
    }
    super(ERROR_MESSAGES[code]);
    this.name = "QrspiError";
    this.code = code;
    this.details = details;
  }
}

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function isExactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function isPhase(value: unknown): value is Phase {
  return typeof value === "string" && (PHASES as readonly string[]).includes(value);
}

export function isExecutablePhase(value: unknown): value is ExecutablePhase {
  return isPhase(value) && value !== "done";
}

export function assertTaskId(taskId: string): void {
  if (
    taskId.length === 0 ||
    taskId.length > LIMITS.task_id_characters ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(taskId)
  ) {
    throw new QrspiError("task-id-invalid", { task_id: taskId });
  }
}

export function createRoute(
  currentPhase: Phase,
  taskId: string,
  pullRequestUrl: string | null = null,
): RouteProjection {
  if (currentPhase === "done") {
    if (pullRequestUrl === null) throw new Error("terminal routes require a pull request URL");
    return {
      current_phase: "done",
      next_phase: null,
      phase_skill: null,
      resume_command: null,
      phase_command: null,
      pull_request_url: pullRequestUrl,
    };
  }

  if (pullRequestUrl !== null) throw new Error("executable routes cannot include a pull request URL");
  const index = PHASES.indexOf(currentPhase);
  const nextPhase = PHASES[index + 1];
  if (nextPhase === undefined) throw new Error(`missing next phase for ${currentPhase}`);
  return {
    current_phase: currentPhase,
    next_phase: nextPhase,
    phase_skill: `qrspi-${currentPhase}`,
    resume_command: `/qrspi --resume --task-id ${taskId}`,
    phase_command: `/qrspi-${currentPhase} --task-id ${taskId}`,
    pull_request_url: null,
  };
}

export function createTaskProjection(
  record: TaskRecord,
  currentWorktreeRoot: string,
  pullRequestUrl: string | null = null,
): TaskProjection {
  const route = createRoute(record.current_phase, record.task_id, pullRequestUrl);
  return { ...record, current_worktree_root: currentWorktreeRoot, route };
}

export function createReferenceResult(result: ReferenceResult): ReferenceResult {
  if (result.status === "copied") {
    if (result.destination === null || result.reason !== null) {
      throw new Error("copied references require a destination and no reason");
    }
  } else if (result.reason === null) {
    throw new Error("non-copied references require a reason");
  }
  return result;
}

export function createAcceptedEnvelope(
  task: TaskProjection,
  phase: ExecutablePhase,
  evidence: AcceptedEvidence,
): AcceptedEnvelope {
  const artifactPhases: readonly ExecutablePhase[] = [
    "question",
    "research",
    "design",
    "structure",
    "plan",
  ];
  const matches = artifactPhases.includes(phase)
    ? evidence.kind === "artifact"
    : phase === "worktree"
      ? evidence.kind === "workspace_ready"
      : phase === "implement"
        ? evidence.kind === "implementation_complete"
        : evidence.kind === "pull_request";
  if (!matches) throw new Error(`accepted evidence does not match ${phase}`);
  return { kind: "accepted", task, phase, evidence };
}

export function failureEnvelope<C extends ErrorCode>(error: QrspiError<C>): FailureEnvelope {
  return {
    error: { code: error.code, message: ERROR_MESSAGES[error.code], details: error.details },
  } as FailureEnvelope;
}

export function serializeJson(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

export function serializeFailure<C extends ErrorCode>(error: QrspiError<C>): string {
  const document = serializeJson(failureEnvelope(error));
  if (utf8Bytes(ERROR_MESSAGES[error.code]) > LIMITS.error_message_bytes) {
    throw new Error("registered error message exceeds its byte limit");
  }
  if (utf8Bytes(JSON.stringify(error.details)) > LIMITS.error_details_bytes) {
    throw new Error("error details exceed their byte limit");
  }
  if (utf8Bytes(document) > LIMITS.failure_document_bytes) {
    throw new Error("failure document exceeds its byte limit");
  }
  return document;
}
