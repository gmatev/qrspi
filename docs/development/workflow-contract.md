# Workflow Contract

Read this document when changing phase order, inputs, outputs, artifacts, or
hand-offs. The root README remains the user-facing overview; this file records
the contributor-facing invariants that must stay coherent across skills.

## Phase Contract

| Phase / skill | Reads | Produces or changes | Human gate |
| --- | --- | --- | --- |
| 1. Question / `qrspi-question` | Task description, ticket, or issue | `task.md`, `questions.md` | Approve or edit research questions |
| 2. Research / `qrspi-research` | `questions.md` only | `research.md` | Review findings and request follow-up |
| 3. Design / `qrspi-design` | `task.md`, `questions.md`, `research.md` | `design.md` | Answer design questions, then approve design |
| 4. Structure / `qrspi-structure` | `design.md`, `research.md` | `structure.md` | Review phase boundaries and checkpoints |
| 5. Plan / `qrspi-plan` | `structure.md`, `design.md`, `research.md` | `plan.md` | Resolve open questions before final plan |
| 6. Worktree / `qrspi-worktree` | Artifact directory and existing plan | Branch, worktree, copied artifacts | Confirm before creating the worktree |
| 7. Implement / `qrspi-implement` | `plan.md` plus files named by the active phase | Code, plan checkboxes, phase commits | Manual verification after each phase unless waived |
| 8. PR / `qrspi-pr` | `design.md`, actual diff, commit history | GitHub pull request | Normal repository review process |

All artifacts are stored in a `<task-id>` directory within `<tasks-directory>` configured in `.qrspi/config.json`
which can be set with the `/setup-qrspi` skill.

## Core Invariants

### Fresh-context hand-offs

Each phase is designed to run in a new context window. A phase cannot depend on
facts that exist only in the previous conversation. Required state must live in
an explicitly named artifact.

### Configurable artifact storage

Task artifacts live under the repository's configured `<tasks-directory>`.
Documentation and skill hand-offs use that placeholder rather than embedding a
fixed directory. Changing the configured location does not change artifact
names, allowed phase inputs, or Research's task blindness.

### Research blindness

Research receives neutral questions and must not know the desired solution.
Phase 2 therefore reads `questions.md` and must not read `task.md`, a ticket, or
later artifacts. This separation is central to reducing confirmation bias.

### Human alignment before detail

Design asks questions and waits before writing `design.md`. Structure is the
last compact, human-oriented review before the tactical plan becomes detailed.
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

## Cross-File Changes

When changing any item below, search and update every occurrence:

- phase numbers, names, or order;
- skill invocations such as `/qrspi-design`;
- artifact names such as `research.md`;
- artifact-directory examples;
- agent names referenced by skills;
- human confirmation and pause behavior;
- README tables, examples, file trees, and explanatory prose;
- the setup skill's config field, default, `AGENTS.md` guidance, and ignore-rule
  contract; and
- each skill's `## Input`, `## Output`, and `## When to Go Back` sections.

Consider an ADR when an invariant changes intentionally, but create one only if
the choice meets all criteria in [the ADR guide](../adr/README.md). Do not use an
ADR to paper over accidental inconsistency between files.
