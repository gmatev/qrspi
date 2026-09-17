# Task recovery

Use this procedure for `/qrspi --resume` and direct phase invocation.

1. Run `bun "<HARNESS_DIR>/tools/qrspi.ts" router --resume`, adding
   `--task-id <task-id>` only when the caller supplied one.

2. If the response is `selection_required`, show the sorted valid and corrupt
   inventories, ask the user to repeat the current invocation with one task ID,
   and stop.

3. If the response is `needs_workspace_entry`:
   - On Claude Code, use `EnterWorktree({"path": <workspace_entry.worktree_root>})`.
   - On other harnesses, it is not possible to move the session to a new worktree.
   Consider the worktree entry failed.

   If the worktree entry attempt has failed provide instructions to launch a new
   session in the absolute path `<workspace_entry.worktree_root>` and to initiate
   `workspace_entry.continuation_command` in the new session. Then STOP.

4. Re-validate that the task is properly established:

   ```bash
   bun "<HARNESS_DIR>/tools/qrspi.ts" router --resume --task-id <task-id>
   ```

5. Accept only a fresh `kind: "existing"` projection from the required registered task
   worktree. Bind `<task-id>` and `<task-directory>` from that projection; do
   not reuse values returned before a workspace move.

6. If the fresh projection has `current_phase: "done"`, report exactly the
   persisted local result and STOP:

   ```text
   Task: <task-id>
   Phase: done
   Pull request: <confirmed-url>
   ```

   Use `route.pull_request_url` as `<confirmed-url>`. Do not query the remote.

Do not execute a returned slash command internally. Only the main orchestrator
invokes the engine, inspects task routing state, or chooses a workflow phase.
