# Repository Guidance

## Project

QRSPI is a distributable eight-phase software delivery workflow:
Question, Research, Design, Structure, Plan, Worktree, Implement, and PR.

Canonical product source lives under `src/`, with client-specific configuration
under `harness/`. Treat source instructions, frontmatter, harness mappings,
phase boundaries, artifact names, and next-step messages as public interfaces.
Generated distributions under `dist/` are build artifacts and are not tracked.

QRSPI is packaged for both Claude Code and Codex. Preserve deliberate client
differences while keeping shared identity, workflow behavior, and versioning
aligned.

Start with [README.md](README.md) for the user-facing workflow and
[CONTRIBUTING.md](CONTRIBUTING.md) for the contributor workflow.

## Repository Map

- `src/skills/qrspi-*/` — canonical source for the eight ordered workflow skills.
- `src/agents/` — canonical Markdown research-agent instructions.
- `harness/claude/` — Claude-specific agent model mappings.
- `harness/codex/` — Codex agent model mappings.
- `scripts/package.ts` — deterministic transpilation into `dist/<harness>/`.
- `scripts/install.ts` — direct project installer for Claude or Codex.
- `CONTRIBUTING.md` — contributor entry point and documentation router.
- `docs/development/` — shared technical guidance for human and automated
  contributors.
- `docs/adr/` — architecture decision records for surprising, project-specific
  choices whose rationale is not recoverable from the current code or docs.

## Working Agreements

- Preserve the separation between phases. Each skill may read only the inputs
  named in its `## Input` section unless the workflow contract is intentionally
  changed.
- Preserve Research's task blindness: phase 2 must not read `task.md`, tickets,
  or descriptions of the desired feature.
- Keep research agents descriptive. They document existing code and do not
  propose changes unless their role is deliberately redefined.
- Prefer focused edits over broad skill rewrites. Repetition can be intentional
  when each skill must work in a fresh context window.
- Keep examples generic and repository-independent; users install QRSPI
  into codebases with different languages and tools.
- Keep phase order, skill names, artifact filenames, and hand-off instructions
  aligned across the README and all affected skills.
- Keep shared product instructions under `src/` and harness-only values under
  `harness/<harness>/`. Do not edit generated `dist/` output as source.
- Keep agent model mappings complete and aligned with the canonical agent set.
- Preserve each generated harness's supported schema; do not copy unsupported
  frontmatter or agent fields between clients.
- Preserve explicit-only phase invocation for both clients unless a deliberate
  workflow decision changes it.
- Document conventional architecture and current-state facts in
  `docs/development/`,
  not in ADRs.
- Keep code comments factual and durable. Do not narrate obvious code, invent
  rationale, preserve dead code, or leave anonymous TODOs.
- Do not add tool names to agent frontmatter unless that tool is actually needed
  by the agent's instructions.
- Do not put secrets, credentials, machine-specific absolute paths, or private
  repository details in skills, agent definitions, or documentation.

## Contributor Documentation

Do not read every maintainer document by default. Load only the references that
match the work:

- Any change to phase inputs, outputs, ordering, or hand-offs: read
  [workflow-contract.md](docs/development/workflow-contract.md).
- Any change to a workflow skill or research-agent prompt: read
  [skill-authoring.md](docs/development/skill-authoring.md).
- Any change to packaging, skill metadata, installation layout, or client
  compatibility: read
  [distribution-packaging.md](docs/development/distribution-packaging.md).
- Any test design, implementation, or release-readiness work: read
  [testing.md](docs/development/testing.md).
- Any change that adds, revises, or invalidates code comments or TODOs: read
  [commenting.md](docs/development/commenting.md).
- Any change that revises a hard-to-reverse, non-obvious, project-specific
  choice: inspect [docs/adr/README.md](docs/adr/README.md). Add or replace an ADR
  only when genuine alternatives were evaluated and the historical rationale
  would otherwise be lost.
- If the task spans several of these areas, begin with
  [CONTRIBUTING.md](CONTRIBUTING.md) and follow its routing table.

When a relevant document conflicts with the implementation, call out the drift
and resolve it in the same change. Instructions in this file take precedence
over linked maintainer documentation.

## Change Process

1. Read the affected file in full and identify upstream and downstream phases.
2. State which workflow invariant or ADR the change affects, if any.
3. Make the smallest coherent change, including cross-file terminology updates.
4. Run the applicable tests and transitional checks in
   `docs/development/testing.md`.
5. Review the final diff as a user who installed the distribution into another
   project.

## Completion Criteria

A change is complete when:

- canonical metadata and generated skill and agent definitions remain valid for
  their intended client;
- phase inputs, outputs, and next-step messages agree;
- README examples still match the shipped files;
- relevant automated tests and required manual checks pass; and
- contributor documentation is updated when behavior or rationale changed.

Run `bun run package`, `bun test`, and `bun run typecheck` for changes to
deterministic project code or shipped distribution contracts. Report
documentation-only checks precisely rather than describing them as tests.

## Scoped Guidance

Add nested `AGENTS.md` files only when a subtree develops genuinely different
rules. Keep repository-wide guidance here and put explanations in
the contributor documentation rather than expanding this file into a handbook.
