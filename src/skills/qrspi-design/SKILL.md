---
name: qrspi-design
description: Design discussion — align on where we are going before planning how
argument-hint: "[--task-id <task-id>]"
disable-model-invocation: true
---

# Design — Where Are We Going?

Create a ~200-line design document that captures the current state, desired end state, design decisions, and patterns to follow. This is the **lowest-cost point for direction changes** — get alignment here before investing in detailed planning.

## Input

Accept either:

- the composed envelope `{ task_id, task_directory, composed: true }`; or
- direct invocation as `/qrspi-design [--task-id <task-id>]`.

## Entry and artifact contract

1. For direct invocation ONLY, load and follow
   `../qrspi/references/task-resume.md`

2. For any invocation model, run:

```text
bun "<HARNESS_DIR>/tools/qrspi.ts" phase enter --phase design --task-id <task-id>
```

Require `kind: "entered"`. Artifacts reside at the fresh projection absolute paths.

Allowed input: `task.md`, `references/*`, `questions.md`, `research.md`
Allowed output: `design.md`

## Process

1. **Read all three artifacts fully.** `task.md` and optional `references/*` tell you
what we're building. `research.md` tells you what exists. Understand both before proceeding.

2. **Targeted exploration**: If the research revealed areas that need deeper investigation for design decisions, spawn **codebase-pattern-finder** or **codebase-analyzer** agents to examine specific patterns or approaches.

3. **Present open questions and wait for answers.** Before writing anything, you MUST:
   - List 3-5 design questions that require human judgment
   - Present options with trade-offs for each, grounded in what the research found
   - Wait for the user to respond

   Example:
   ```
   Before I write the design document, I need your input:

   **Q1: Data model approach**
   The research shows two patterns in the codebase:
   - Option A: [pattern from research.md] — used in [file:line], simpler but less flexible
   - Option B: [pattern from research.md] — used in [file:line], more complex but extensible
   Which fits this use case?

   **Q2: ...**
   ```

   Do NOT skip this step. Do NOT write the design document without user input.

4. **Write `design.md`** (~200 lines) to the artifact directory:

   ```markdown
   # Design Discussion

   ## Current State
   [What exists today, grounded in research findings with file:line refs]

   ## Desired End State
   [What we're building and how to verify it's correct]

   ## Patterns to Follow
   [Existing codebase patterns the implementation should match, with file:line refs.
   Flag any patterns the research found that should NOT be followed.]

   ## Design Decisions
   1. **[Decision name]**: [chosen option] — [why]
   2. **[Decision name]**: [chosen option] — [why]
   ...

   ## What We're NOT Doing
   [Explicit scope boundaries to prevent creep]

   ## Open Risks
   [Anything uncertain that might surface during implementation]
   ```

5. **Present the design to the user** for review. Iterate until they approve.

## Completion

Only after the user approves the design, run:

```text
bun "<HARNESS_DIR>/tools/qrspi.ts" phase validate --phase design --task-id <task-id>
```

Require `kind: "accepted"`. Do not validate while questions or revisions are pending.

## Output

Report the task ID, absolute task directory, accepted Design evidence, and both
continuation commands:

Artifact written: `design.md`.

```text
Continue execution with
/qrspi --resume --task-id <task-id>

OR

/qrspi-structure --task-id <task-id>
```

## Rules

- ~200 lines max. This is a steering document, not a specification.
- Every pattern reference must cite `file:line` from the research.
- You MUST ask questions and wait before writing. No exceptions.
- "Patterns to Follow" is critical — call out both good and bad patterns found in the codebase.
- "What We're NOT Doing" prevents scope creep downstream.
- Subagents do not invoke the QRSPI engine, inspect `task.json`, or choose workflow phases.

## When to Go Back

If the research is missing critical information needed for design decisions — the questions missed an important area of the codebase — tell the user and suggest re-running `/qrspi-question --task-id <task-id>` and `/qrspi-research --task-id <task-id>` to fill the gap before proceeding with an incomplete design.
