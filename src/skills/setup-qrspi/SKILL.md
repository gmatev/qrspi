---
name: setup-qrspi
description: Configure a repository's QRSPI tasks directory and supporting guidance
disable-model-invocation: true
---

# Setup QRSPI

Configure the repository-local directory that QRSPI uses for task artifacts.
This is a prompt-driven setup skill: inspect, recommend, preview, confirm, then
write. Run it only after the user explicitly invokes this skill.

## Input

This skill takes no arguments. Reject positionals and flags.

The canonical field is `tasks_directory`, a repository-relative directory
stored in `.qrspi/config.json`.

- Prefer the existing value when it is valid.
- Otherwise recommend `.qrspi/tasks`.
- Let the user supply a different value during the initial choice step.
- Accept slash-separated components containing only letters, digits, `.`, `_`,
  and `-`. Reject absolute paths, whitespace, backslashes, empty components,
  trailing slashes, and `.` or `..` components.

## Process

### 1. Inspect and choose the tasks directory

Resolve the Git repository root, then read these files when present:

- `.qrspi/config.json`
- `AGENTS.md`
- `.gitignore`

Report the current `tasks_directory`, the `## QRSPI Configuration` guidance,
and the tasks-directory ignore rule. Treat missing or unusable configuration as
unconfigured. Do not inspect, migrate, or report legacy artifact locations.

Recommend the valid existing directory, or `.qrspi/tasks` when none is
configured. Ask the user to accept the recommendation or supply another value.
Validate and normalize the chosen value once using the `## Input` contract.

### 2. Preview

Show the exact changes to all three files before writing. Let the user revise
the preview, then ask once for confirmation.

#### `.qrspi/config.json`

Create the file when absent. When it exists, set `tasks_directory` and preserve
every other key. Write conventional two-space JSON with a trailing newline. The
default result is:

```json
{
  "tasks_directory": ".qrspi/tasks"
}
```

#### `AGENTS.md`

Create the root file when absent. Reconcile only QRSPI's configuration guidance
under `## QRSPI Configuration`; preserve surrounding content and any other
guidance in that section. The recommended text is:

```markdown
## QRSPI Configuration

QRSPI configuration lives in `.qrspi/config.json`. Store each task's workflow
artifacts under `<tasks-directory>/<task-id>/`. When `tasks_directory` is
absent, use `.qrspi/tasks`.
```

#### `.gitignore`

Create the file when absent. Add or update this labeled block using the chosen
directory with a leading repository anchor and trailing slash. Preserve every
other rule:

```gitignore
# QRSPI tasks
/.qrspi/tasks/
```

The ignore rule is a recommendation. If the user removes it during preview,
honor that choice. Never add a blanket `.qrspi/` ignore because
`.qrspi/config.json` is tracked project configuration.

### 3. Confirm and write

Write only after the user confirms the complete preview. Re-read each target
before editing so intervening changes are preserved. Reconcile existing content
in place rather than appending duplicate sections, keys, or labeled blocks. Do
not create the tasks directory itself and do not commit.

### 4. Complete

Report the configured directory and the files changed. Tell the user to commit
`AGENTS.md`, `.qrspi/config.json`, and `.gitignore` so newly created Git
worktrees inherit the configuration. Re-running this skill reconciles the same
three locations when the tasks directory changes.
