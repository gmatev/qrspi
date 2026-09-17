---
name: qrspi
description: Create or resume a managed QRSPI task
argument-hint: "--new --task-id <task-id> -- <description> | --resume [--task-id <task-id>]"
disable-model-invocation: true
---

# QRSPI — Managed Task Router

Create a managed task or resume exactly one phase at its persisted frontier.

## Input

Accept exactly one of:

```text
/qrspi --new --task-id <task-id> -- <description>
/qrspi --resume [--task-id <task-id>]
```

For `--new`, require one task ID, a literal `--`, and a nonempty description.
Do not trim or rewrite `<description>`.

## Process

### New task

ONLY follow if flag `--new` was supplied.

1. Run:

   ```bash
   bun scripts/qrspi.ts router --new --task-id <task-id> -- <description>
   ```

   Require exactly one JSON response with `kind: "available"`. Preserve the
   returned `<description>` verbatim for bootstrap.

2. Identify any local file references in `<description>`. Resolve
   relative paths against the current checkout and convert them to absolute
   paths. Keep URLs as URL strings and never download them. This extraction is
   advisory; a description need not contain a reference.

3. Send exactly this JSON shape to
   `bun "<HARNESS_DIR>/tools/qrspi.ts" task bootstrap --input -`:

   ```json
   {
     "task_id": "<task-id>",
     "description": "<description>",
     "references": [{ "source": "<absolute-local-path-or-URL>" }]
   }
   ```

   Require `kind: "bootstrapped"`. Report every reference result; a skipped or
   failed reference does not turn a successful bootstrap into a failure.

4. Establish execution in the required worktree:
   - On Claude Code, use `EnterWorktree({"path": <workspace_entry.worktree_root>})`.
   - On other harnesses, it is not possible to move the session to a new worktree.
   Consider the worktree entry failed.

   If the worktree entry attempt has failed provide instructions to launch a new
   session in the absolute path `<workspace_entry.worktree_root>` and to initiate
   `workspace_entry.continuation_command` in the new session. Then STOP.

5. Validate that the new task is fully established:

   ```bash
   bun "<HARNESS_DIR>/tools/qrspi.ts" router --resume --task-id <task-id>
   ```
   Accept only a fresh `kind: "existing` projection from the required registered task
   worktree. Bind `<task-id>` and `<task-directory>` from that projection; do
   not reuse values returned before a workspace move.

5. Load and follow skill `qrspi-question` with the following structured
parameters envelope:

   ```json
   {
     "task_id": "<task-id>",
     "task_directory": "<absolute task directory>",
     "composed": true
   }
   ```

   Do not execute a returned slash command internally.

### Resume

ONLY follow if flag `--resume` was supplied.

1. Follow `references/task-resume.md`, forwarding a supplied `<task-id>`.

2. If the fresh task projection has `current_phase: "done"`, report its task
   ID, absolute task directory, and persisted pull-request URL, then stop.

3. Otherwise, require a non-null engine-selected `<phase-skill>`. Load and
   follow exactly that skill with only:

   ```json
   {
     "task_id": "<task-id>",
     "task_directory": "<task-directory>",
     "composed": true
   }
   ```

4. Dispatch exactly one phase. Return its acceptance result without loading a
   second phase.

## Output

The selected phase owns phase output. The router reports structured errors,
task selection, workspace entry, or terminal persisted data when it stops
before phase dispatch.

## Rules

- Do not edit `task.json` directly.
- Do not execute a returned slash command internally.
- Stop on any structured top-level error and report its safe code and details.
- Never infer a phase or task path when the engine did not return it.
