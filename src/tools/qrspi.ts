import {
  QrspiError,
  isExecutablePhase,
  serializeFailure,
  serializeJson,
  type ExecutablePhase,
} from "./protocol.ts";
import { enterPhase, validatePhase } from "./phase.ts";
import {
  bootstrapTask,
  discoverTasks,
  parseBootstrapInput,
  prepareNewTask,
  resolveRepository,
  resolveTask,
} from "./task.ts";

const HELP = `Usage:
  qrspi.ts router --new --task-id <task-id> -- <description>
  qrspi.ts router --resume [--task-id <task-id>]
  qrspi.ts task bootstrap --input -
  qrspi.ts task list
  qrspi.ts phase enter --phase <phase> [--task-id <task-id>]
  qrspi.ts phase validate --phase <phase> [--task-id <task-id>]
  qrspi.ts --help
`;

type Command =
  | { kind: "new"; taskId: string; description: string }
  | { kind: "resume"; taskId?: string }
  | { kind: "bootstrap" }
  | { kind: "list" }
  | { kind: "enter" | "validate"; phase: ExecutablePhase; taskId?: string }
  | { kind: "help" };

function usage(command: string | null): never {
  throw new QrspiError("usage-error", { command });
}

function parseOptionalTaskId(args: string[], command: string): string | undefined {
  if (args.length === 0) return undefined;
  if (args.length !== 2 || args[0] !== "--task-id" || args[1] === undefined) usage(command);
  return args[1];
}

function parsePhaseArgs(args: string[], command: string): { phase: ExecutablePhase; taskId?: string } {
  let phase: string | undefined;
  let taskId: string | undefined;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if ((flag !== "--phase" && flag !== "--task-id") || value === undefined || seen.has(flag)) usage(command);
    seen.add(flag);
    if (flag === "--phase") phase = value;
    else taskId = value;
  }
  if (phase === undefined) usage(command);
  if (!isExecutablePhase(phase)) throw new QrspiError("phase-invalid", { phase });
  return { phase, ...(taskId === undefined ? {} : { taskId }) };
}

export function parseCommand(args: string[]): Command {
  if (args.length === 1 && args[0] === "--help") return { kind: "help" };
  const [group, operation, ...rest] = args;
  if (group === "router") {
    if (operation === "--new") {
      const separator = rest.indexOf("--");
      if (separator < 0) usage("router --new");
      const flags = rest.slice(0, separator);
      const descriptionTokens = rest.slice(separator + 1);
      if (flags.length !== 2 || flags[0] !== "--task-id" || flags[1] === undefined) usage("router --new");
      const description = descriptionTokens.join(" ");
      if (description.length === 0) throw new QrspiError("description-required", {});
      return { kind: "new", taskId: flags[1], description };
    }
    if (operation === "--resume") {
      const taskId = parseOptionalTaskId(rest, "router --resume");
      return { kind: "resume", ...(taskId === undefined ? {} : { taskId }) };
    }
    usage(group ?? null);
  }
  if (group === "task") {
    if (operation === "bootstrap" && rest.length === 2 && rest[0] === "--input" && rest[1] === "-") {
      return { kind: "bootstrap" };
    }
    if (operation === "list" && rest.length === 0) return { kind: "list" };
    usage(operation === undefined ? group ?? null : `${group} ${operation}`);
  }
  if (group === "phase" && (operation === "enter" || operation === "validate")) {
    const parsed = parsePhaseArgs(rest, `${group} ${operation}`);
    return { kind: operation, ...parsed };
  }
  usage(group ?? null);
}

function closesFirstJsonValue(source: string): number | null {
  let inString = false;
  let escaped = false;
  let depth = 0;
  let started = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (!started) {
      if (/\s/u.test(character ?? "")) continue;
      if (character !== "{") return null;
      started = true;
      depth = 1;
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return null;
}

export function parseStdin(source: string): ReturnType<typeof parseBootstrapInput> {
  if (source.length === 0 || source.trim().length === 0) {
    throw new QrspiError("stdin-invalid", { reason: "empty" });
  }
  const boundary = closesFirstJsonValue(source);
  if (boundary !== null && source.slice(boundary).trim().length > 0) {
    throw new QrspiError("stdin-invalid", { reason: "trailing" });
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new QrspiError("stdin-invalid", { reason: "malformed" });
  }
  return parseBootstrapInput(value);
}

export async function dispatch(command: Command, cwd: string, stdin = ""): Promise<unknown> {
  switch (command.kind) {
    case "help":
      return HELP;
    case "new":
      return prepareNewTask(cwd, { task_id: command.taskId, description: command.description });
    case "resume":
      return resolveTask(cwd, { task_id: command.taskId });
    case "bootstrap":
      return bootstrapTask(cwd, parseStdin(stdin));
    case "list":
      return discoverTasks(await resolveRepository(cwd));
    case "enter":
      return enterPhase(cwd, { phase: command.phase, task_id: command.taskId });
    case "validate":
      return validatePhase(cwd, { phase: command.phase, task_id: command.taskId });
  }
}

async function main(): Promise<void> {
  try {
    const command = parseCommand(Bun.argv.slice(2));
    const input = command.kind === "bootstrap" ? await Bun.stdin.text() : "";
    const result = await dispatch(command, process.cwd(), input);
    if (command.kind === "help") await Bun.stdout.write(String(result));
    else await Bun.stdout.write(serializeJson(result));
  } catch (error) {
    const safeError = error instanceof QrspiError
      ? error
      : new QrspiError("internal-error", { operation: "dispatch" });
    let document: string;
    try {
      document = serializeFailure(safeError);
    } catch {
      document = serializeFailure(new QrspiError("internal-error", { operation: "serialize-failure" }));
    }
    await Bun.stderr.write(document);
    process.exitCode = 2;
  }
}

if (import.meta.main) await main();
