import {
  constants,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  LIMITS,
  QrspiError,
  assertTaskId,
  createReferenceResult,
  createTaskProjection,
  isExactRecord,
  isPhase,
  utf8Bytes,
  type AvailableEnvelope,
  type BootstrappedEnvelope,
  type CorruptTaskCode,
  type CorruptTaskEntry,
  type ExistingEnvelope,
  type NeedsWorkspaceEntryEnvelope,
  type ReferenceResult,
  type SelectionRequiredEnvelope,
  type TaskInventory,
  type TaskListEntry,
  type TaskProjection,
  type TaskRecord,
} from "./protocol.ts";

const TASKS_ROOT = [".qrspi", "tasks", "current"] as const;
const WORKTREES_ROOT = [".qrspi", "worktrees"] as const;
const TASK_RECORD_KEYS = [
  "task_id",
  "worktree_root",
  "main_worktree_root",
  "task_directory",
  "current_phase",
] as const;

export interface RegisteredWorktree {
  worktree_root: string;
  head: string | null;
  branch: string | null;
}

export interface RepositoryContext {
  invocation_root: string;
  main_worktree_root: string;
  common_git_directory: string;
  worktrees: RegisteredWorktree[];
}

export interface TaskRequest {
  task_id?: string;
}

export interface NewTaskRequest {
  task_id: string;
  description: string;
}

export interface ReferenceRequest {
  source: string;
}

export interface BootstrapInput {
  task_id: string;
  description: string;
  references: ReferenceRequest[];
}

export type TaskResolution =
  | ExistingEnvelope
  | SelectionRequiredEnvelope
  | NeedsWorkspaceEntryEnvelope;

interface GitResult {
  stdout: Uint8Array;
  stderr: Uint8Array;
  exitCode: number;
}

const decoder = new TextDecoder();

function containedPath(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function taskDirectory(worktreeRoot: string): string {
  return join(worktreeRoot, ...TASKS_ROOT);
}

function managedWorktree(mainRoot: string, taskId: string): string {
  return join(mainRoot, ...WORKTREES_ROOT, taskId);
}

function markerPath(worktreeRoot: string): string {
  return join(taskDirectory(worktreeRoot), "task.json");
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return false;
    throw error;
  }
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function spawnGit(cwd: string, args: readonly string[]): Promise<GitResult> {
  try {
    const process = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
    const [stdoutBuffer, stderrBuffer, exitCode] = await Promise.all([
      new Response(process.stdout).arrayBuffer(),
      new Response(process.stderr).arrayBuffer(),
      process.exited,
    ]);
    return {
      stdout: new Uint8Array(stdoutBuffer),
      stderr: new Uint8Array(stderrBuffer),
      exitCode,
    };
  } catch {
    throw new QrspiError("git-command-failed", { operation: args[0] ?? "git" });
  }
}

export async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  const result = await spawnGit(cwd, args);
  if (result.exitCode !== 0) {
    throw new QrspiError("git-command-failed", { operation: args[0] ?? "git" });
  }
  return decoder.decode(result.stdout);
}

function parseWorktrees(output: string): Array<{ path: string; head: string | null; branch: string | null }> {
  const parsed: Array<{ path: string; head: string | null; branch: string | null }> = [];
  let current: { path: string; head: string | null; branch: string | null } | null = null;
  for (const field of output.split("\0")) {
    if (field.length === 0) continue;
    if (field.startsWith("worktree ")) {
      if (current !== null) parsed.push(current);
      current = { path: field.slice("worktree ".length), head: null, branch: null };
    } else if (current !== null && field.startsWith("HEAD ")) {
      current.head = field.slice("HEAD ".length);
    } else if (current !== null && field.startsWith("branch ")) {
      current.branch = field.slice("branch ".length);
    }
  }
  if (current !== null) parsed.push(current);
  return parsed;
}

export async function resolveRepository(cwd: string): Promise<RepositoryContext> {
  const absoluteCwd = resolve(cwd);
  const inside = await spawnGit(absoluteCwd, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.exitCode !== 0 || decoder.decode(inside.stdout).trim() !== "true") {
    throw new QrspiError("repository-not-found", { cwd: absoluteCwd });
  }

  try {
    const [invocationOutput, commonOutput, worktreeOutput] = await Promise.all([
      runGit(absoluteCwd, ["rev-parse", "--show-toplevel"]),
      runGit(absoluteCwd, ["rev-parse", "--git-common-dir"]),
      runGit(absoluteCwd, ["worktree", "list", "--porcelain", "-z"]),
    ]);
    const invocationRoot = await realpath(invocationOutput.trim());
    const commonRaw = commonOutput.trim();
    const commonGitDirectory = await realpath(
      isAbsolute(commonRaw) ? commonRaw : resolve(absoluteCwd, commonRaw),
    );
    const parsedWorktrees = parseWorktrees(worktreeOutput);
    const firstWorktree = parsedWorktrees[0];
    if (firstWorktree === undefined) throw new Error("Git returned no registered worktrees");
    const mainRoot = await realpath(firstWorktree.path);
    const worktrees: RegisteredWorktree[] = [];
    for (const entry of parsedWorktrees) {
      worktrees.push({
        worktree_root: await realpath(entry.path),
        head: entry.head,
        branch: entry.branch,
      });
    }
    if (!worktrees.some((entry) => entry.worktree_root === mainRoot)) {
      throw new Error("main worktree is not registered");
    }
    if (!worktrees.some((entry) => entry.worktree_root === invocationRoot)) {
      throw new Error("invocation worktree is not registered");
    }
    return {
      invocation_root: invocationRoot,
      main_worktree_root: mainRoot,
      common_git_directory: commonGitDirectory,
      worktrees,
    };
  } catch (error) {
    if (error instanceof QrspiError && error.code === "repository-not-found") throw error;
    throw new QrspiError("repository-topology-invalid", { cwd: absoluteCwd });
  }
}

async function assertSetup(context: RepositoryContext): Promise<void> {
  const missing: string[] = [];
  for (const root of ["/.qrspi/tasks/", "/.qrspi/worktrees/"] as const) {
    const probe = root === "/.qrspi/tasks/"
      ? ".qrspi/tasks/.qrspi-ignore-probe"
      : ".qrspi/worktrees/.qrspi-ignore-probe";
    const result = await spawnGit(context.main_worktree_root, [
      "check-ignore",
      "--no-index",
      "--quiet",
      "--",
      probe,
    ]);
    if (result.exitCode !== 0) missing.push(root);
  }
  if (missing.length > 0) {
    throw new QrspiError("setup-required", {
      main_worktree_root: context.main_worktree_root,
      missing,
    });
  }
}

function parseTaskRecordValue(value: unknown, path: string): TaskRecord {
  if (!isExactRecord(value, TASK_RECORD_KEYS)) {
    throw new QrspiError("task-record-invalid", { marker_path: path, reason: "shape" });
  }
  if (typeof value.task_id !== "string") {
    throw new QrspiError("task-record-invalid", { marker_path: path, reason: "task-id" });
  }
  try {
    assertTaskId(value.task_id);
  } catch {
    throw new QrspiError("task-record-invalid", { marker_path: path, reason: "task-id" });
  }
  if (!isPhase(value.current_phase)) {
    throw new QrspiError("task-record-invalid", { marker_path: path, reason: "phase" });
  }
  if (
    typeof value.worktree_root !== "string" ||
    typeof value.main_worktree_root !== "string" ||
    typeof value.task_directory !== "string" ||
    !isAbsolute(value.worktree_root) ||
    !isAbsolute(value.main_worktree_root) ||
    !isAbsolute(value.task_directory)
  ) {
    throw new QrspiError("task-record-invalid", { marker_path: path, reason: "path" });
  }
  return {
    task_id: value.task_id,
    worktree_root: value.worktree_root,
    main_worktree_root: value.main_worktree_root,
    task_directory: value.task_directory,
    current_phase: value.current_phase,
  };
}

export async function readTaskRecord(path: string): Promise<TaskRecord> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (isNodeError(error, "ENOENT")) throw error;
    throw new QrspiError("task-record-invalid", { marker_path: path, reason: "json" });
  }
  return parseTaskRecordValue(value, path);
}

async function validateTaskRecord(
  context: RepositoryContext,
  worktreeRoot: string,
  expectedTaskId: string,
): Promise<TaskRecord> {
  const marker = markerPath(worktreeRoot);
  let record: TaskRecord;
  try {
    record = await readTaskRecord(marker);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      throw new QrspiError("task-incomplete", {
        task_id: expectedTaskId,
        worktree_root: worktreeRoot,
        marker_path: marker,
      });
    }
    throw error;
  }
  if (record.task_id !== expectedTaskId) {
    throw new QrspiError("task-path-mismatch", {
      marker_path: marker,
      field: "task_id",
      expected: expectedTaskId,
      actual: record.task_id,
    });
  }
  const expected: Record<"worktree_root" | "main_worktree_root" | "task_directory", string> = {
    worktree_root: worktreeRoot,
    main_worktree_root: context.main_worktree_root,
    task_directory: taskDirectory(worktreeRoot),
  };
  for (const field of Object.keys(expected) as Array<keyof typeof expected>) {
    let actual: string;
    try {
      actual = await realpath(record[field]);
    } catch {
      throw new QrspiError("task-record-invalid", { marker_path: marker, reason: "path" });
    }
    if (record[field] !== actual || actual !== expected[field]) {
      throw new QrspiError("task-path-mismatch", {
        marker_path: marker,
        field,
        expected: expected[field],
        actual: record[field],
      });
    }
  }
  if (!context.worktrees.some((entry) => entry.worktree_root === record.worktree_root)) {
    throw new QrspiError("task-path-mismatch", {
      marker_path: marker,
      field: "worktree_root",
      expected: worktreeRoot,
      actual: record.worktree_root,
    });
  }
  const descriptionPath = join(record.task_directory, "task.md");
  try {
    const descriptionStat = await stat(descriptionPath);
    if (!descriptionStat.isFile() || descriptionStat.size === 0) throw new Error("invalid");
  } catch {
    throw new QrspiError("task-description-invalid", { path: descriptionPath });
  }
  return record;
}

function corruptCode(error: unknown): CorruptTaskCode {
  if (!(error instanceof QrspiError)) return "record-invalid";
  if (error.code === "task-incomplete") return "marker-missing";
  if (error.code === "task-path-mismatch") return "path-mismatch";
  if (error.code === "task-description-invalid") return "description-invalid";
  return "record-invalid";
}

function managedTaskId(context: RepositoryContext, worktreeRoot: string): string | null {
  const managedRoot = join(context.main_worktree_root, ...WORKTREES_ROOT);
  const rel = relative(managedRoot, worktreeRoot);
  if (rel.length === 0 || rel.startsWith("..") || isAbsolute(rel) || rel.includes(sep)) return null;
  return rel;
}

export async function discoverTasks(context: RepositoryContext): Promise<TaskInventory> {
  await assertSetup(context);
  const tasks: TaskListEntry[] = [];
  const corrupt: CorruptTaskEntry[] = [];
  for (const worktree of context.worktrees) {
    if (worktree.worktree_root === context.main_worktree_root) continue;
    const taskId = managedTaskId(context, worktree.worktree_root);
    if (taskId === null) continue;
    const marker = markerPath(worktree.worktree_root);
    try {
      const record = await validateTaskRecord(context, worktree.worktree_root, taskId);
      tasks.push({
        task_id: record.task_id,
        worktree_root: record.worktree_root,
        task_directory: record.task_directory,
        current_phase: record.current_phase,
      });
    } catch (error) {
      corrupt.push({
        task_id: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(taskId) ? taskId : null,
        worktree_root: worktree.worktree_root,
        marker_path: marker,
        code: corruptCode(error),
      });
    }
  }
  tasks.sort((left, right) => left.task_id.localeCompare(right.task_id));
  corrupt.sort((left, right) =>
    (left.task_id ?? "").localeCompare(right.task_id ?? "") ||
    left.worktree_root.localeCompare(right.worktree_root)
  );
  return {
    tasks: tasks.slice(0, LIMITS.inventory_tasks),
    corrupt: corrupt.slice(0, LIMITS.inventory_corrupt),
    tasks_truncated: tasks.length > LIMITS.inventory_tasks,
    corrupt_truncated: corrupt.length > LIMITS.inventory_corrupt,
  };
}

function continuation(taskId: string): string {
  return `/qrspi --resume --task-id ${taskId}`;
}

function projection(record: TaskRecord, context: RepositoryContext): TaskProjection {
  return createTaskProjection(record, context.invocation_root);
}

export async function resolveTask(cwd: string, request: TaskRequest): Promise<TaskResolution> {
  const context = await resolveRepository(cwd);
  await assertSetup(context);
  if (request.task_id !== undefined) assertTaskId(request.task_id);
  const inventory = await discoverTasks(context);
  let taskId = request.task_id;
  if (taskId === undefined) {
    taskId = managedTaskId(context, context.invocation_root) ?? undefined;
    if (taskId === undefined) return { kind: "selection_required", ...inventory };
  }

  const matchingWorktrees = context.worktrees.filter(
    (entry) => managedTaskId(context, entry.worktree_root) === taskId,
  );
  if (matchingWorktrees.length === 0) {
    throw new QrspiError("task-not-found", {
      task_id: taskId,
      tasks: inventory.tasks.slice(0, LIMITS.error_inventory_tasks),
      corrupt: inventory.corrupt.slice(0, LIMITS.error_inventory_corrupt),
      truncated:
        inventory.tasks_truncated ||
        inventory.corrupt_truncated ||
        inventory.tasks.length > LIMITS.error_inventory_tasks ||
        inventory.corrupt.length > LIMITS.error_inventory_corrupt,
    });
  }
  if (matchingWorktrees.length > 1) {
    throw new QrspiError("task-duplicate", {
      task_id: taskId,
      worktree_roots: matchingWorktrees.map((entry) => entry.worktree_root).sort(),
    });
  }
  const selected = matchingWorktrees[0];
  if (selected === undefined) throw new Error("selected worktree disappeared");
  const record = await validateTaskRecord(context, selected.worktree_root, taskId);
  const task = projection(record, context);
  if (context.invocation_root !== record.worktree_root) {
    return {
      kind: "needs_workspace_entry",
      task,
      workspace_entry: {
        required: true,
        worktree_root: record.worktree_root,
        continuation_command: continuation(taskId),
      },
    };
  }
  return { kind: "existing", task };
}

async function assertNewTaskGuards(context: RepositoryContext): Promise<void> {
  await assertSetup(context);
  const gitignorePath = join(context.main_worktree_root, ".gitignore");
  const tracked = await spawnGit(context.main_worktree_root, [
    "ls-files",
    "--error-unmatch",
    "--",
    ".gitignore",
  ]);
  if (tracked.exitCode !== 0) throw new QrspiError("gitignore-untracked", { path: gitignorePath });
  const unchanged = await spawnGit(context.main_worktree_root, [
    "diff",
    "--quiet",
    "HEAD",
    "--",
    ".gitignore",
  ]);
  if (unchanged.exitCode !== 0) throw new QrspiError("gitignore-dirty", { path: gitignorePath });
  const statusResult = await spawnGit(context.main_worktree_root, [
    "status",
    "--porcelain",
    "--untracked-files=no",
  ]);
  if (statusResult.exitCode !== 0) {
    throw new QrspiError("git-command-failed", { operation: "status" });
  }
  if (statusResult.stdout.byteLength > 0) {
    throw new QrspiError("main-worktree-dirty", {
      main_worktree_root: context.main_worktree_root,
    });
  }
}

async function taskCollisions(context: RepositoryContext, taskId: string): Promise<string[]> {
  const collisions: string[] = [];
  const branch = `refs/heads/qrspi/${taskId}`;
  const branchResult = await spawnGit(context.main_worktree_root, ["show-ref", "--verify", "--quiet", branch]);
  if (branchResult.exitCode === 0) collisions.push(`branch:qrspi/${taskId}`);
  const worktreePath = managedWorktree(context.main_worktree_root, taskId);
  if (await exists(worktreePath)) collisions.push(`worktree:${worktreePath}`);
  return [...new Set(collisions)].sort();
}

function assertDescription(description: string): void {
  if (description.length === 0) throw new QrspiError("description-required", {});
  if (utf8Bytes(description) > LIMITS.description_bytes) {
    throw new QrspiError("input-limit-exceeded", {
      field: "description",
      limit: LIMITS.description_bytes,
    });
  }
}

export async function prepareNewTask(
  cwd: string,
  request: NewTaskRequest,
): Promise<AvailableEnvelope> {
  assertTaskId(request.task_id);
  assertDescription(request.description);
  const context = await resolveRepository(cwd);
  await assertNewTaskGuards(context);
  const collisions = await taskCollisions(context, request.task_id);
  if (collisions.length > 0) {
    throw new QrspiError("task-id-occupied", { task_id: request.task_id, collisions });
  }
  const worktreeRoot = managedWorktree(context.main_worktree_root, request.task_id);
  return {
    kind: "available",
    task_id: request.task_id,
    description: request.description,
    branch_name: `qrspi/${request.task_id}`,
    current_worktree_root: context.invocation_root,
    main_worktree_root: context.main_worktree_root,
    worktree_root: worktreeRoot,
    task_directory: taskDirectory(worktreeRoot),
  };
}

function nulPaths(bytes: Uint8Array): string[] {
  const value = decoder.decode(bytes);
  return value.split("\0").filter((item) => item.length > 0);
}

async function selectWorktreeIncludes(mainRoot: string): Promise<string[]> {
  const includePath = join(mainRoot, ".worktreeinclude");
  if (!(await exists(includePath))) return [];
  try {
    const includeStat = await lstat(includePath);
    if (!includeStat.isFile()) throw new Error("not regular");
    await readFile(includePath);
  } catch {
    throw new QrspiError("worktree-include-invalid", { path: includePath });
  }
  const [included, ignored] = await Promise.all([
    spawnGit(mainRoot, [
      "ls-files",
      "--others",
      "--ignored",
      "--exclude-from=.worktreeinclude",
      "-z",
    ]),
    spawnGit(mainRoot, ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"]),
  ]);
  if (included.exitCode !== 0 || ignored.exitCode !== 0) {
    throw new QrspiError("worktree-include-invalid", { path: includePath });
  }
  const ignoredSet = new Set(nulPaths(ignored.stdout));
  const selected = nulPaths(included.stdout).filter((path) => ignoredSet.has(path)).sort();
  for (const relativePath of selected) {
    const source = resolve(mainRoot, relativePath);
    if (!containedPath(mainRoot, source)) {
      throw new QrspiError("worktree-include-invalid", { path: includePath });
    }
    try {
      const sourceStat = await lstat(source);
      const parent = await realpath(dirname(source));
      if (!sourceStat.isFile() || !containedPath(mainRoot, parent)) throw new Error("unsafe");
    } catch {
      throw new QrspiError("worktree-include-invalid", { path: includePath });
    }
  }
  return selected;
}

async function copyIncludedFiles(mainRoot: string, worktreeRoot: string, paths: string[]): Promise<void> {
  for (const relativePath of paths) {
    const source = resolve(mainRoot, relativePath);
    const destination = resolve(worktreeRoot, relativePath);
    if (!containedPath(mainRoot, source) || !containedPath(worktreeRoot, destination)) {
      throw new QrspiError("worktree-copy-failed", { source, destination });
    }
    try {
      await mkdir(dirname(destination), { recursive: true });
      const parent = await realpath(dirname(destination));
      if (!containedPath(worktreeRoot, parent)) throw new Error("unsafe destination");
      await copyFile(source, destination, constants.COPYFILE_EXCL);
    } catch {
      throw new QrspiError("worktree-copy-failed", { source, destination });
    }
  }
}

async function copyReferences(
  requests: ReferenceRequest[],
  directory: string,
): Promise<ReferenceResult[]> {
  const results: ReferenceResult[] = [];
  const seen = new Set<string>();
  const destinations = new Set<string>();
  const referencesRoot = join(directory, "references");
  await mkdir(referencesRoot, { recursive: true });
  const canonicalReferencesRoot = await realpath(referencesRoot);
  for (const request of requests) {
    const source = request.source;
    if (seen.has(source)) {
      results.push(createReferenceResult({ source, destination: null, status: "skipped", reason: "duplicate-source" }));
      continue;
    }
    seen.add(source);
    if (utf8Bytes(source) > LIMITS.path_bytes) {
      results.push(createReferenceResult({
        source,
        destination: null,
        status: "skipped",
        reason: "source-limit-exceeded",
      }));
      continue;
    }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(source)) {
      results.push(createReferenceResult({ source, destination: null, status: "skipped", reason: "remote-url" }));
      continue;
    }
    if (!isAbsolute(source)) {
      results.push(createReferenceResult({ source, destination: null, status: "skipped", reason: "source-not-absolute" }));
      continue;
    }
    const destination = join(referencesRoot, basename(source));
    if (!containedPath(canonicalReferencesRoot, destination)) {
      results.push(createReferenceResult({ source, destination: null, status: "failed", reason: "destination-collision" }));
      continue;
    }
    let sourceStat;
    try {
      sourceStat = await lstat(source);
    } catch {
      results.push(createReferenceResult({ source, destination, status: "skipped", reason: "source-missing" }));
      continue;
    }
    if (!sourceStat.isFile()) {
      results.push(createReferenceResult({ source, destination, status: "skipped", reason: "source-not-regular" }));
      continue;
    }
    if (destinations.has(destination) || (await exists(destination))) {
      results.push(createReferenceResult({ source, destination, status: "failed", reason: "destination-collision" }));
      continue;
    }
    destinations.add(destination);
    try {
      await copyFile(source, destination, constants.COPYFILE_EXCL);
      results.push(createReferenceResult({ source, destination, status: "copied", reason: null }));
    } catch {
      results.push(createReferenceResult({ source, destination, status: "failed", reason: "copy-failed" }));
    }
  }
  return results;
}

function normalizedDescription(description: string): string {
  return `${description.replace(/(?:\r\n|\r|\n)+$/u, "")}\n`;
}

async function exclusiveWrite(path: string, content: string, mode?: number): Promise<void> {
  const handle = await open(path, "wx", mode);
  try {
    await handle.writeFile(content, "utf8");
  } finally {
    await handle.close();
  }
}

export async function writeTaskRecord(path: string, record: TaskRecord): Promise<void> {
  const temporary = `${path}.tmp-${process.pid}-${crypto.randomUUID()}`;
  try {
    await exclusiveWrite(temporary, `${JSON.stringify(record, null, 2)}\n`, 0o600);
    await rename(temporary, path);
  } catch {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw new QrspiError("task-write-failed", { path });
  }
}

export async function updateTaskRecord(
  path: string,
  expectedPhase: TaskRecord["current_phase"],
  nextPhase: TaskRecord["current_phase"],
): Promise<TaskRecord> {
  const current = await readTaskRecord(path);
  if (current.current_phase !== expectedPhase) {
    if (expectedPhase === "done") throw new Error("done cannot be an executable expected phase");
    throw new QrspiError("phase-stale", { expected: expectedPhase, actual: current.current_phase });
  }
  const next = { ...current, current_phase: nextPhase };
  await writeTaskRecord(path, next);
  return next;
}

async function rollbackBootstrap(mainRoot: string, worktreeRoot: string, taskId: string): Promise<void> {
  await spawnGit(mainRoot, ["worktree", "remove", "--force", worktreeRoot]).catch(() => undefined);
  await spawnGit(mainRoot, ["branch", "-D", `qrspi/${taskId}`]).catch(() => undefined);
}

export function parseBootstrapInput(value: unknown): BootstrapInput {
  if (!isExactRecord(value, ["task_id", "description", "references"])) {
    throw new QrspiError("stdin-invalid", { reason: "shape" });
  }
  if (
    typeof value.task_id !== "string" ||
    typeof value.description !== "string" ||
    !Array.isArray(value.references) ||
    value.references.some(
      (item) => !isExactRecord(item, ["source"]) || typeof item.source !== "string" || item.source.length === 0,
    )
  ) {
    throw new QrspiError("stdin-invalid", { reason: "shape" });
  }
  return {
    task_id: value.task_id,
    description: value.description,
    references: value.references as ReferenceRequest[],
  };
}

export async function bootstrapTask(cwd: string, input: BootstrapInput): Promise<BootstrappedEnvelope> {
  assertTaskId(input.task_id);
  assertDescription(input.description);
  if (input.references.length > LIMITS.references) {
    throw new QrspiError("input-limit-exceeded", {
      field: "references",
      limit: LIMITS.references,
    });
  }
  const available = await prepareNewTask(cwd, input);
  const context = await resolveRepository(cwd);
  const includedFiles = await selectWorktreeIncludes(context.main_worktree_root);
  const add = await spawnGit(context.main_worktree_root, [
    "worktree",
    "add",
    "-b",
    available.branch_name,
    available.worktree_root,
    "HEAD",
  ]);
  if (add.exitCode !== 0) {
    throw new QrspiError("worktree-add-failed", {
      task_id: input.task_id,
      worktree_root: available.worktree_root,
    });
  }

  try {
    const worktreeRoot = await realpath(available.worktree_root);
    await copyIncludedFiles(context.main_worktree_root, worktreeRoot, includedFiles);
    const directory = taskDirectory(worktreeRoot);
    await mkdir(directory, { recursive: true });
    const references = await copyReferences(input.references, directory);
    const descriptionPath = join(directory, "task.md");
    try {
      await exclusiveWrite(descriptionPath, normalizedDescription(input.description));
    } catch {
      throw new QrspiError("task-write-failed", { path: descriptionPath });
    }
    const record: TaskRecord = {
      task_id: input.task_id,
      worktree_root: worktreeRoot,
      main_worktree_root: context.main_worktree_root,
      task_directory: directory,
      current_phase: "question",
    };
    await writeTaskRecord(join(directory, "task.json"), record);
    return {
      kind: "bootstrapped",
      task: createTaskProjection(record, context.invocation_root),
      references,
      workspace_entry: {
        required: true,
        worktree_root: worktreeRoot,
        continuation_command: continuation(input.task_id),
      },
    };
  } catch (error) {
    await rollbackBootstrap(context.main_worktree_root, available.worktree_root, input.task_id);
    throw error;
  }
}

export async function listReferenceFiles(taskDirectoryPath: string): Promise<string[]> {
  const referencesRoot = join(taskDirectoryPath, "references");
  try {
    const entries = await readdir(referencesRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => join(referencesRoot, entry.name))
      .sort();
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return [];
    throw error;
  }
}

export const taskPaths = { taskDirectory, managedWorktree, markerPath };
