---
name: qrspi-worktree
description: Verify the managed task worktree is ready for implementation
argument-hint: "[--task-id <task-id>]"
disable-model-invocation: true
---

# Worktree — Verify the Implementation Workspace

Verify that the task's already-managed worktree and plan are ready for
implementation. This phase does not create a branch, create a worktree, copy
artifacts, or ask for confirmation.

## Input

Accept either:

- the composed envelope `{ task_id, task_directory, composed: true }`; or
- direct invocation as `/qrspi-worktree [--task-id <task-id>]`.

## Entry and artifact contract

1. For direct invocation ONLY, load and follow
   `../qrspi/references/task-resume.md`

2. For any invocation model, run:

```text
bun "<HARNESS_DIR>/tools/qrspi.ts" phase enter --phase worktree --task-id <task-id>
```

Require `kind: "entered"`. Artifacts reside at the fresh projection absolute paths.

Allowed input: `plan.md`
Allowed output: none

## Process

1. Read the returned `plan.md` fully.
2. Treat the registered worktree as already created and populated. Do not
   perform implementation work in this phase.

## Completion

Run:

```text
bun "<HARNESS_DIR>/tools/qrspi.ts" phase validate --phase worktree --task-id <task-id>
```

Require `kind: "accepted"` with `workspace_ready` evidence. The engine owns all
workspace-readiness and task-state checks.

## Output

Report the task ID, absolute task directory, accepted Worktree evidence, and
both continuation commands:

```text
Continue execution with
/qrspi --resume --task-id <task-id>

OR

/qrspi-implement --task-id <task-id>
```

## Rules

- Do not create a branch or worktree.
- Do not copy task artifacts or repository files.
- Do not edit `task.json` directly.
- Only the main orchestrator invokes the QRSPI engine, inspects `task.json`, or
  selects phases.

## When to Go Back

If `plan.md` is missing, tell the user and suggest re-running
`/qrspi-plan --task-id <task-id>`.
