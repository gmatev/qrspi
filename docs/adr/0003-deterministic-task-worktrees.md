# ADR-0003: Create deterministic managed task worktrees

- Status: accepted
- Date: 2026-09-17

QRSPI creates a task's branch and managed worktree during `/qrspi --new`, then
stores its authoritative identity, current phase, and accepted evidence in
`.qrspi/tasks/current/task.json` inside that worktree. A deterministic engine
owns task resolution, phase entry, rewind, validation, and terminal routing;
skills consume only the absolute paths it projects for their phase.

This makes every phase operate from the same canonical checkout and removes the
need for skills to infer state from conversation history, artifact presence, or
plan checkboxes. The later Worktree phase is therefore a readiness gate for the
existing worktree, not the point where Git state is created.

## Considered options

- Keep artifacts in the main checkout until Worktree. This makes early phases
  vulnerable to path drift and requires copying state midway through a task.
- Let each skill infer the active task and phase. This reduces runtime code but
  duplicates state rules across prompts and permits divergent routing.
- Store one task directory per ID in the managed worktree. This repeats identity
  already fixed by the worktree and complicates the stable artifact contract.

## Consequences

New tasks create their worktree from the current `HEAD` commit before Question.
QRSPI requires only that `/.qrspi/worktrees/` is effectively ignored and leaves
all other eligibility decisions to `git worktree add`; staged, unstaged, and
untracked changes remain in the originating worktree. The fixed artifact root
is `.qrspi/tasks/current/`, and worktrees live at
`.qrspi/worktrees/<task-id>/`. Rewinds retain artifacts but clear affected
evidence, and forward jumps fail closed. Changes to these paths or task-record
semantics require a protocol migration across runtime, skills, docs, and tests.
