---
name: qrspi-structure
description: Structure outline — vertical slices with test checkpoints
argument-hint: "[--task-id <task-id>]"
disable-model-invocation: true
---

# Structure — How Do We Get There?

Create a ~2-page structure outline that breaks the design into **vertical slices** — each independently testable. Show the signatures, types, and phase boundaries — not the full implementation.

## Input

Accept either:

- the composed envelope `{ task_id, task_directory, composed: true }`; or
- direct invocation as `/qrspi-structure [--task-id <task-id>]`.

## Entry and artifact contract

1. For direct invocation ONLY, load and follow
   `../qrspi/references/task-resume.md`

2. For any invocation model, run:

```text
bun "<HARNESS_DIR>/tools/qrspi.ts" phase enter --phase structure --task-id <task-id>
```

Require `kind: "entered"`. Artifacts reside at the fresh projection absolute paths.

Allowed input: `design.md`, `research.md`
Allowed output: `structure.md`

## Process

1. **Read all allowed artifacts that may exist fully.**

2. **Break the work into vertical slices.** Each slice delivers end-to-end functionality:
   - Crosses all necessary layers (database, service, API, UI) for that slice
   - Can be tested independently after implementation
   - Has a clear verification checkpoint

   **Vertical** (correct):
   > Phase 1: Add the "reticulate" endpoint — migration, store method, API handler, basic UI button. Test: endpoint returns 200, button triggers call.

   **Horizontal** (wrong):
   > Phase 1: All database migrations. Phase 2: All service methods. Phase 3: All API endpoints. Phase 4: All UI changes.

3. **Define the phase order.** Earlier phases should establish foundations that later phases build on. If Phase 3 fails, Phases 1-2 should still be independently valuable.

4. **For each phase, list**:
   - What it accomplishes (1-2 sentences)
   - Files affected
   - Key type signatures or interface changes
   - How to verify it works (automated command + what to check manually)

5. **Write `structure.md`** to the artifact directory:

   ```markdown
   # Structure Outline

   ## Approach
   [1-2 sentences: the implementation strategy from design.md, condensed]

   ## Phase 1: [Name]
   [What this phase delivers end-to-end]

   **Files**: `path/to/file.ext`, `path/to/other.ext`
   **Key changes**:
   - `functionName(param: Type): ReturnType` — new/modified
   - `NewType { field: Type }` — new type

   **Verify**: [project test command] passes; [manual check description]

   ---

   ## Phase 2: [Name]
   ...

   ## Testing Checkpoints
   [Summary of what should be true after each phase, useful for resuming if context resets]
   ```

6. **Present the outline to the user** and wait for feedback. Common adjustments:
   - Reordering phases
   - Splitting a phase that's too large
   - Adding a testing phase between sensitive phases
   - Requesting more detail on a specific phase

## Completion

Only after the user approves the structure, run:

```text
bun "<HARNESS_DIR>/tools/qrspi.ts" phase validate --phase structure --task-id <task-id>
```

Require `kind: "accepted"`. Do not validate while revisions are pending.

## Output

Report the task ID, absolute task directory, accepted Structure evidence, and
both continuation commands:

Artifact written: `structure.md`.

```text
Continue execution with
/qrspi --resume --task-id <task-id>

OR

/qrspi-plan --task-id <task-id>
```

## Rules

- ~2 pages max. If it's longer, you're writing the plan, not the outline.
- Vertical slices, not horizontal layers. Every phase must cross all relevant layers.
- Signatures and types, not full implementation. Show WHAT changes, not HOW.
- Each phase must have a verification checkpoint.
- If the design calls for something that can't be sliced vertically, note it explicitly.
- Subagents do not invoke the QRSPI engine, inspect `task.json`, or choose workflow phases.

## When to Go Back

If you discover the design missed a critical constraint or made a decision based on incorrect assumptions about the codebase, tell the user and suggest re-running `/qrspi-design --task-id <task-id>` rather than working around a flawed design.
