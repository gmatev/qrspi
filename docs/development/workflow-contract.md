# Workflow Contract

Read this document when changing phase order, inputs, outputs, artifacts, or
hand-offs. The root README remains the user-facing overview; this file records
the contributor-facing invariants that must stay coherent across skills.

## Project environment setup

`/setup-qrspi` when run in a Git projrct installs the tracked guidance and ignore
rules required the QRSPI artifact store pтхс.

## Phase Contract

| Phase / skill | Reads | Produces or changes | Human gate |
| --- | --- | --- | --- |
| Router / `qrspi` | New-task description and optional local references, or an existing task ID | Creation-time managed worktree, `task.md`, copied references, `task.json`, or one-phase dispatch | None |
| 1. Question / `qrspi-question` | Existing `task.md` and copied references | `questions.md` | Approve or edit research questions |
| 2. Research / `qrspi-research` | `questions.md` only | `research.md` | Review findings and request follow-up |
| 3. Design / `qrspi-design` | `task.md`, copied references, `questions.md`, `research.md` | `design.md` | Confirm the design-interview recap, then approve the design |
| 4. Structure / `qrspi-structure` | `design.md`, `research.md` | `structure.md` | Review phase boundaries and checkpoints |
| 5. Plan / `qrspi-plan` | `structure.md`, `design.md`, `research.md` | `plan.md` | Resolve open questions before final plan |
| 6. Implement / `qrspi-implement` | `plan.md` plus files named by the active phase | Code, plan checkboxes, phase commits | Manual verification after each phase unless waived |
| 7. PR / `qrspi-pr` | `design.md`, `plan.md`, actual diff, commit history | Pull request, exact URL in `pr.md`, terminal task state | Normal repository review process |

Active artifacts are stored at `.qrspi/tasks/current/` in the managed worktree
rooted at `.qrspi/worktrees/<task-id>/` beneath the main worktree. The router
creates that branch and worktree while bootstrapping the task, before Question
runs.

## Core Invariants

### Fresh-context hand-offs

Each phase is designed to run in a new context window. A phase cannot depend on
facts that exist only in the previous conversation. Required state must live in
an explicitly named artifact.

### Fixed managed-task storage

Task artifacts and worktrees use the fixed paths above. Skills receive absolute
paths from the deterministic engine rather than constructing repository paths.
Changing artifact names or these roots is a protocol migration; Research's
task blindness and the declared phase inputs remain unchanged.

Task creation requires only that Git effectively ignores
`/.qrspi/worktrees/`. It otherwise delegates branch and checkout behavior to
`git worktree add -b <branch> <path> HEAD`: the new worktree contains the `HEAD`
snapshot, while staged, unstaged, and untracked changes remain in the
originating worktree. Explicit `.worktreeinclude` copies occur afterward.

### Engine-owned task state and routing

`task.json` is the authoritative task record. It stores the task ID, current
phase marker, accepted phase evidence, and canonical worktree identity. Skills
never inspect it to choose a phase. They call the deterministic engine, require
the expected response kind, and read or write only the returned absolute paths.

`/qrspi --resume` resolves the task and dispatches exactly one executable
phase. Direct phase invocation may enter the current phase again or rewind to
an earlier phase. A rewind clears accepted evidence for that phase and every
later phase but retains artifact files for inspection. Forward jumps are
rejected. Terminal `done` dispatches no phase.

Accepted evidence is intentionally shallow: it proves the expected artifact,
implementation, or PR fact existed when validated; it is not a content hash or a claim
that retained artifacts can never change. Validation advances the marker only
after the phase's deterministic completion conditions pass.

### Research blindness

Research receives neutral questions and must not know the desired solution.
Phase 2 therefore reads `questions.md` and must not read `task.md`, a ticket, or
later artifacts. This separation is central to reducing confirmation bias.
Question may read only `task.md` and copied `references/*`; Design may also read
those task inputs plus `questions.md` and `research.md`. Structure reads only
`design.md` and `research.md`, Plan reads only `structure.md`, `design.md`, and
`research.md`, Implement reads `plan.md`, and PR reads `design.md`
and `plan.md`.

### Human alignment before detail

Design works through a decision tree whose depth is commensurate with the task.
It asks prerequisite-ready decisions in rounds, waits for the user's answers,
and confirms a thematic recap before writing `design.md`. Structure is the last
compact, human-oriented review before the tactical plan becomes detailed.
Skills must not silently remove these gates.

### Vertical implementation slices

Structure divides work into independently verifiable, end-to-end phases rather
than grouping all changes by technical layer. Each phase needs a concrete check
that can prove the slice works before later phases build on it.

### Recoverable progress

Verification checkboxes in `plan.md` are the implementation progress record.
Phase commits make completed slices independently inspectable and revertible.

### Explicit backward movement

Every planning and implementation phase may send the user back when its inputs
are incomplete or structurally wrong. Small implementation mismatches may be
adapted in place; changes that invalidate a design assumption should return to
the appropriate earlier phase.

### Two-command hand-offs

After accepting a non-terminal phase, a skill reports both ways to continue:
`/qrspi --resume --task-id <task-id>` for composed routing and the direct next
phase command. PR instead reports the exact accepted URL and terminal `done`
state. Every command uses universal slash form in both harnesses.

## Cross-File Changes

When changing any item below, search and update every occurrence:

- phase numbers, names, or order;
- skill invocations such as `/qrspi-design`;
- artifact names such as `research.md`;
- artifact-directory examples;
- agent names referenced by skills;
- human confirmation and pause behavior;
- README tables, examples, file trees, and explanatory prose;
- the setup skill's fixed paths, `AGENTS.md` guidance, and ignore-rule contract;
  and
- each skill's `## Input`, `## Output`, and `## When to Go Back` sections.

Consider an ADR when an invariant changes intentionally, but create one only if
the choice meets all criteria in [the ADR guide](../adr/README.md). Do not use an
ADR to paper over accidental inconsistency between files.
