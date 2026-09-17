---
name: setup-qrspi
description: Configure a repository for fixed-path QRSPI task workspaces
disable-model-invocation: true
---

# Setup QRSPI

Configure the repository guidance and ignore rules required by QRSPI. This is
an explicit, prompt-driven setup skill: inspect, preview, confirm, then write.

## Input

This skill takes no arguments. Reject positionals and flags.

QRSPI always uses these repository-relative locations:

- task artifacts: `.qrspi/tasks/current/<task-id>/`
- managed worktrees: `.qrspi/worktrees/<task-id>/`

Do not read, create, preserve, migrate, warn about, or delete
`.qrspi/config.json`. Do not ask the user to choose directories.

## Process

### 1. Inspect

Resolve the canonical Git main worktree, then read `AGENTS.md` and `.gitignore`
in full when present. Report the current QRSPI-owned guidance and ignore block.
Do not create either ignored directory.

### 2. Preview

Show the exact proposed changes to both files. Preserve all unrelated content.
Let the user revise the preview, then ask once for confirmation.

#### `AGENTS.md`

Create the root file when absent. Reconcile only the owned section headed
`## QRSPI Configuration`; do not duplicate the heading or replace surrounding
guidance. Use this content:

```markdown
## QRSPI Configuration

QRSPI stores active task artifacts under
`.qrspi/tasks/current/<task-id>/` and creates managed task worktrees under
`.qrspi/worktrees/<task-id>/`.

Start a task with `/qrspi --new --task-id <task-id> -- <description>`. Resume
one phase with `/qrspi --resume [--task-id <task-id>]`, or invoke a phase
directly with `/qrspi-<phase> [--task-id <task-id>]`.
```

#### `.gitignore`

Create the file when absent. Reconcile one labeled block with both required,
repository-anchored rules:

```gitignore
# QRSPI managed tasks
/.qrspi/tasks/
/.qrspi/worktrees/
```

Both ignores are required. If the user removes or declines either rule during
preview, report that setup is incomplete and do not claim success.

### 3. Confirm and write

Write only after the user confirms the complete preview. Immediately before
each edit, reread both target files so intervening changes are preserved.
Reconcile owned content in place rather than appending duplicate sections or
blocks. Do not create the ignored directories and do not commit.

### 4. Complete

Report the files changed and the two fixed paths. Tell the user to commit
`AGENTS.md` and `.gitignore` before creating a task so new worktrees inherit
the repository contract. Re-running this skill reconciles the same two owned
surfaces.
