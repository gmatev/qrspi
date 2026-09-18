import { describe, expect, test } from "bun:test";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHarnessContext } from "../../src/hooks/qrspi-context";
import {
  createTestRepository,
  repositoryPath,
  runGit,
  runProcess,
} from "../helpers/repository";

describe("QRSPI harness context hook", () => {
  test("binds the canonical harness directory from a worktree subdirectory", async () => {
    const repository = await createTestRepository();
    try {
      const tools = join(repository.root, ".codex", "tools");
      const subdirectory = join(repository.root, "nested", "directory");
      await mkdir(tools, { recursive: true });
      await mkdir(subdirectory, { recursive: true });
      await writeFile(join(tools, "qrspi.ts"), "export {};\n");

      const output = await createHarnessContext("codex", "SessionStart", subdirectory);

      expect(output.hookSpecificOutput.hookEventName).toBe("SessionStart");
      const canonicalRoot = await realpath(repository.root);
      expect(output.hookSpecificOutput.additionalContext).toContain(
        JSON.stringify(join(canonicalRoot, ".codex")),
      );
      expect(output.hookSpecificOutput.additionalContext).toContain(
        "supersedes any earlier value",
      );
    } finally {
      await repository.cleanup();
    }
  });

  test("rebinds against the current linked worktree root", async () => {
    const repository = await createTestRepository();
    try {
      const linked = join(repository.root, ".qrspi", "worktrees", "hook-check");
      const added = await runGit(repository.root, "worktree", "add", "-q", "-b", "hook-check", linked);
      expect(added.exitCode).toBe(0);
      const tools = join(linked, ".claude", "tools");
      await mkdir(tools, { recursive: true });
      await writeFile(join(tools, "qrspi.ts"), "export {};\n");

      const output = await createHarnessContext("claude", "PostToolUse", linked);

      expect(output.hookSpecificOutput.hookEventName).toBe("PostToolUse");
      const canonicalLinked = await realpath(linked);
      const canonicalRoot = await realpath(repository.root);
      expect(output.hookSpecificOutput.additionalContext).toContain(
        JSON.stringify(join(canonicalLinked, ".claude")),
      );
      expect(output.hookSpecificOutput.additionalContext).not.toContain(
        JSON.stringify(join(canonicalRoot, ".claude")),
      );
    } finally {
      await repository.cleanup();
    }
  });

  test("supersedes stale bindings with an unavailable state", async () => {
    const repository = await createTestRepository();
    try {
      const output = await createHarnessContext("codex", "SessionStart", repository.root);
      expect(output.hookSpecificOutput.additionalContext).toContain(
        "<HARNESS_DIR> is unavailable",
      );
      expect(output.hookSpecificOutput.additionalContext).toContain(
        "supersedes any earlier binding",
      );
    } finally {
      await repository.cleanup();
    }
  });

  test("emits event-specific hook JSON when invoked as a process", async () => {
    const repository = await createTestRepository();
    try {
      const tools = join(repository.root, ".claude", "tools");
      await mkdir(tools, { recursive: true });
      await writeFile(join(tools, "qrspi.ts"), "export {};\n");
      const result = await runProcess(
        [
          "bun",
          repositoryPath("src", "hooks", "qrspi-context.ts"),
          "claude",
        ],
        repository.root,
        JSON.stringify({
          cwd: repository.root,
          hook_event_name: "PostToolUse",
          tool_name: "EnterWorktree",
        }),
      );

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
        },
      });
      expect(result.stderr).toBe("");
    } finally {
      await repository.cleanup();
    }
  });
});
