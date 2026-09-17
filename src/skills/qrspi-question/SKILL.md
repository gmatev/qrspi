---
name: qrspi-question
description: Decompose a managed task into neutral research questions
argument-hint: "[--task-id <task-id>]"
disable-model-invocation: true
---

# Question — Decompose the Task

## Purpose

Transform an existing managed task description into 3–7 specific, neutral
research questions. Research runs later with no knowledge of what is being
built.

## Input

Accept either:

- the composed envelope `{ task_id, task_directory, composed: true }`; or
- direct invocation as `/qrspi-question [--task-id <task-id>]`.

For a direct invocation, follow `../qrspi/references/task-resume.md`. In either
case, run:

```text
bun "<HARNESS_DIR>/tools/qrspi.ts" phase enter --phase question --task-id <task-id>
```

Require `kind: "entered"`. Use only the returned absolute paths. The allowed
inputs are `task.md` and the returned regular files under `references`; the
only output is `questions.md`.

## Entry

Read the returned `task.md` and every returned reference file fully. Do not
inspect sibling workflow artifacts or `task.json`.

## Process

1. Spawn a `codebase-locator` agent for light exploration of repository areas
   related to the task. Give it enough repository context to locate existing
   code, but do not ask it to design changes. The subagent must not invoke the
   QRSPI engine, inspect `task.json`, or select phases.
2. Draft 3–7 research questions. Each should explore a distinct existing area
   or trace a current flow. Ask what exists and how it works, never how to build
   the requested change.
3. Write only the returned `questions.md` output path:

   ```markdown
   # Research Questions

   ## Context
   [Neutral repository areas to investigate, without the goal or desired behavior.]

   ## Questions
   1. [Neutral fact-seeking question]
   ```
4. Present the questions to the user and wait for approval or edits.

## Completion

Only after the user approves the questions, run:

```text
bun "<HARNESS_DIR>/tools/qrspi.ts" phase validate --phase question --task-id <task-id>
```

Require `kind: "accepted"`. Do not call validation while approval or edits are
pending.

## Output

Report the task ID, absolute task directory, accepted Question evidence, and
both continuation commands:

Artifact written: `questions.md`.

```text
/qrspi --resume --task-id <task-id>
/qrspi-research --task-id <task-id>
```

## Rules

- `questions.md` must not reveal the task description, goals, or desired state.
- `questions.md` must NOT contain the task description, goals, or desired behavior;
  the researcher should have no idea what feature is being built.
- `task.md` and references are read-only inputs.
- Write no artifact other than the returned `questions.md` path.
- If the task is too small for three useful questions, tell the user and stop
  before validation.

## When to Go Back

Return to task creation if `task.md` is not an honest or sufficient description
of the goal. Do not compensate by leaking the goal into `questions.md`.
