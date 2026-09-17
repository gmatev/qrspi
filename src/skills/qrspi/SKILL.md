---
name: qrspi
description: Create or resume a managed QRSPI task
argument-hint: "--new --task-id <task-id> -- <description> | --resume [--task-id <task-id>]"
disable-model-invocation: true
---

# QRSPI — Managed Task Router

Create a QRSPI task in its managed Git worktree and enter the Question phase.


## Input

Accepted invocation forms:

```text
/qrspi --new --task-id <task-id> -- <description>
```

Require `--new`, one `--task-id <task-id>`, a literal `--`, and a nonempty
`<description>` after the terminator. Do not trim or rewrite the description.

## Process

1. From the user's current checkout, run:

   ```bash
   bun "<HARNESS_DIR>/tools/qrspi.ts" router --new --task-id <task-id> -- <description>
   ```

   Require exactly one JSON response with `kind: "available"`. Preserve the
   returned `<description>` verbatim for bootstrap.

2. Identify any local file references in `<description>`. Resolve
   relative paths against the current checkout and convert them to absolute
   paths. Keep URLs as URL strings and never download them. This extraction is
   advisory; a description need not contain a reference.

3. Send exactly this JSON shape on stdin to the deterministic engine:

   ```json
   {
     "task_id": "<task-id>",
     "description": "<description>",
     "references": [{ "source": "<absolute local path or URL1>" }]
   }
   ```

   Run `bun "<HARNESS_DIR>/tools/qrspi.ts" task bootstrap --input -`.
   Require `kind: "bootstrapped"` and report every reference result. A skipped
   or failed reference does not make a successful bootstrap fail.

4. Establish execution in the required worktree:
   - On Claude Code, use `EnterWorktree({"path": <workspace_entry.worktree_root>})`.
   - On Codex, it is not possible to move the session to a new worktree. Consider
   the worktree entry failed.

   If the worktree entry attempt has failed provide instructions to launch a new
   session in the absolute path `<workspace_entry.worktree_root>` and to initiate
   `workspace_entry.continuation_command` in the new session. Then STOP.

5. After successful workspace entry, load and follow skill `qrspi-question` with
   the following structured parameters envelope:

   ```json
   {
     "task_id": "<task-id>",
     "task_directory": "<absolute task directory>",
     "composed": true
   }
   ```

   Do not execute a returned slash command internally.

## Output

The `qrspi` router skill does ot independently provide user phase output.
This happens in the specific phase skills that it may load.

## Rules

- Do not edit `task.json` directly.
- Stop on any structured top-level error and report its safe code and details.
