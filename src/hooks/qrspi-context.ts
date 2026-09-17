import { access, realpath } from "node:fs/promises";
import { join } from "node:path";

export type Harness = "claude" | "codex";
export type HookEvent = "SessionStart" | "PostToolUse";

export async function createHarnessContext(
  harness: Harness,
  event: HookEvent,
  cwd: string,
) {
  let additionalContext: string;

  try {
    const git = Bun.spawn(["git", "-C", cwd, "rev-parse", "--show-toplevel"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const [stdout, exitCode] = await Promise.all([
      new Response(git.stdout).text(),
      git.exited,
    ]);
    if (exitCode !== 0) throw new Error();

    const root = await realpath(stdout.trim());
    const harnessDirectory = join(root, `.${harness}`);
    await access(join(harnessDirectory, "tools", "qrspi.ts"));
    additionalContext =
      `Bind <HARNESS_DIR> to ${JSON.stringify(harnessDirectory)}. ` +
      "This binding supersedes any earlier value.";
  } catch {
    additionalContext =
      "<HARNESS_DIR> is unavailable for the current worktree. " +
      "This supersedes any earlier binding; do not run QRSPI skills.";
  }

  return {
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext,
    },
  };
}

if (import.meta.main) {
  const harness = Bun.argv[2] as Harness;
  const input = await Bun.stdin.json() as { cwd: string; hook_event_name: HookEvent };
  console.log(JSON.stringify(
    await createHarnessContext(harness, input.hook_event_name, input.cwd),
  ));
}
