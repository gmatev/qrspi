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

## Entry and artifact contract

1. For direct invocation ONLY, load and follow `../qrspi/references/task-resume.md`

2. For any invocation model, run:

```text
bun "<HARNESS_DIR>/tools/qrspi.ts" phase enter --phase question --task-id <task-id>
```
Require `kind: "entered"`. Artifacts reside at the fresh projection absolute paths.
 
Allowed input: `task.md`, `references/*`
Allowed output: `questions.md`

## Process

1. Read the returned `task.md` and every returned reference file fully. Do not
   inspect sibling workflow artifacts or `task.json`.

2. Spawn a `codebase-locator` agent for light exploration of repository areas
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
   [2-3 sentences describing which areas of the codebase to focus on.
   Do NOT mention what is being built or why.]

   ## Questions
   1. [Neutral, fact-seeking question]
   2. [Neutral, fact-seeking question]
   ...

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
Continue execution with 
/qrspi --resume --task-id <task-id>

OR

/qrspi-research --task-id <task-id>
```

## Rules

- If the task is too simple for at least 3 useful questions, tell the user and stop
  before validation.
- `questions.md` must NOT contain the task description, goals, or desired behavior.
- The researcher should have no idea what feature is being built.

## When to Go Back

Return to task creation if `task.md` is not an honest or sufficient description
of the goal. Do not compensate by leaking the goal into `questions.md`.
