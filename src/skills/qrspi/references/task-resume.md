# Direct task recovery

Use this procedure for direct phase invocation.

1. Run `bun ../qrspi/scripts/qrspi.ts router --resume`, adding
   `--task-id <task-id>` when the caller supplied one.
2. If the response is `selection_required`, show the sorted valid and corrupt
   inventories and ask the user to invoke the phase again with one task ID.
3. If the response is `needs_workspace_entry`, enter its absolute
   `workspace_entry.worktree_root` when the harness supports moving the current
   session, then rerun its `workspace_entry.continuation_command` and repeat
   task recovery. If the harness cannot move the session, show the path and
   command and stop.
4. Accept only a fresh `existing` projection from the required registered task
   worktree. Bind the task ID and absolute task directory from that projection;
   do not reuse pre-move values.
5. Run the phase's own `phase enter` operation. Use only the absolute inputs and
   output returned by the engine.

Do not execute a returned slash command internally. Subagents do not invoke the
engine, inspect `task.json`, or choose workflow phases.
