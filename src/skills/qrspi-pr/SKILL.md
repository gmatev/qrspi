---
name: qrspi-pr
description: Create a pull request with context from the design discussion
argument-hint: "[--task-id <task-id>]"
disable-model-invocation: true
---

# PR — Create the Pull Request

Create a pull request with a description grounded in the design document and
the actual diff.

## Input

Accept either:

- the composed envelope `{ task_id, task_directory, composed: true }`; or
- direct invocation as `/qrspi-pr [--task-id <task-id>]`.

## Entry and artifact contract

1. For direct invocation ONLY, load and follow
   `../qrspi/references/task-resume.md`

2. For any invocation model, run:

```text
bun "<HARNESS_DIR>/tools/qrspi.ts" phase enter --phase pr --task-id <task-id>
```

Require `kind: "entered"`. Artifacts reside at the fresh projection absolute paths.

Allowed input: `design.md`, `plan.md`, live Git diff, and commit history
Allowed output: `pr.md`

## Process

1. **Detect the base branch** and **gather PR information:**
   - Detect base branch: `git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'` (falls back to `main`)
   - `git diff <base>...HEAD` — the full diff
   - `git log <base>...HEAD --oneline` — commit history
   - Read the returned `design.md` and `plan.md` for context on what was built and why

2. Check whether the current branch already has an open pull request. If it
   does, reuse and update that pull request. Reconstruct missing local evidence
   from its confirmed URL; never create a duplicate.

3. **Create or update the PR** using `gh`. Keep the title under 70 characters
   and use this body structure:

   ```markdown
   ## Summary
   [2-3 bullets: what this PR does and why, drawn from design.md]

   ## Design Decisions
   [Key decisions from design.md that reviewers should understand]

   ## Changes
   [Brief description of what changed, organized by component if multi-component]

   ## How to Verify
   - [ ] [Automated verification command]
   - [ ] [Manual verification step]

   ## References
   - Design: `design.md`
   - Plan: `plan.md`
   ```

   If the branch is not pushed, push it first. Create a new pull request only
   when there is no existing open pull request; otherwise edit the existing one.

4. Obtain the confirmed absolute HTTPS pull-request URL from the create, edit,
   or existing-PR result.

5. Before any optional follow-up, atomically write the exact content below to
   the returned `pr.md` path. Write a unique sibling temporary file, then rename
   it over `pr.md` only after the write succeeds. End the file with exactly one
   newline.

   ```markdown
   # Pull Request

   <confirmed-url>
   ```

## Completion

Only after `pr.md` is durably persisted, run:

```text
bun "<HARNESS_DIR>/tools/qrspi.ts" phase validate --phase pr --task-id <task-id>
```

Require `kind: "accepted"`, `current_phase: "done"`, and pull-request evidence
matching `<confirmed-url>`.

## Output

Report exactly:

```text
Task: <task-id>
Phase: done
Pull request: <confirmed-url>
```

## Rules

- Title under 70 chars. Use the body for details.
- The summary should explain WHY, not just WHAT. The diff shows what changed;
  the PR description should explain the reasoning.
- Reference the design and plan docs so reviewers can find the full context.
- If the branch isn't pushed yet, push it first with
  `git push -u origin <branch>`.
- If a PR already exists for this branch, update it with `gh pr edit` instead
  of creating a new one.
- Treat the persisted URL as historical completion evidence.
- Do not validate before the local evidence write succeeds.
- Do not create a duplicate pull request when an open one already exists.
- Only the main orchestrator invokes the QRSPI engine, inspects `task.json`, or
  selects phases.

## When to Go Back

If the implementation, verification, or commit history is incomplete, stop and
suggest returning to `/qrspi-implement --task-id <task-id>` before publishing.
