# Repository Guidance

## Project

QRSPI is a distributable plugin for an eight-phase software delivery workflow:
Question, Research, Design, Structure, Plan, Worktree, Implement, and PR.

The shipped product lives under `plugin/`. Treat files in that tree as public
interfaces: manifests, skill and agent frontmatter, instructions, phase
boundaries, artifact names, and next-step messages may all affect users.

QRSPI is packaged for both Claude Code and Codex. Preserve deliberate client
differences while keeping shared identity, workflow behavior, and versioning
aligned.

Start with [README.md](README.md) for the user-facing workflow and
[CONTRIBUTING.md](CONTRIBUTING.md) for the contributor workflow.

## Repository Map

- `.claude-plugin/marketplace.json` — Claude Code marketplace entry pointing to
  `plugin/`.
- `plugin/.claude-plugin/plugin.json` — Claude Code plugin manifest.
- `plugin/.codex-plugin/plugin.json` — Codex plugin manifest and UI metadata.
- `plugin/skills/qrspi-*/` — the eight ordered workflow skills; each contains
  `SKILL.md` and Codex metadata in `agents/openai.yaml`.
- `plugin/agents/` — bundled research agents referenced by the workflow skills.
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
- Keep examples generic and repository-independent; users install this plugin
  into codebases with different languages and tools.
- Keep phase order, skill names, artifact filenames, and hand-off instructions
  aligned across the README and all affected skills.
- Keep distributable implementation and packaging under `plugin/`. Do not make a
  repository-root development file part of the product implicitly.
- Keep Claude and Codex manifest identity fields aligned. Do not assume the two
  manifest schemas are otherwise interchangeable.
- Preserve explicit-only phase invocation for both clients unless a deliberate
  workflow decision changes it.
- Document conventional architecture and current-state facts in
  `docs/development/`,
  not in ADRs.
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
- Any change to manifests, skill metadata, installation layout, or client
  compatibility: read
  [plugin-packaging.md](docs/development/plugin-packaging.md).
- Any validation or release-readiness work: read
  [validation.md](docs/development/validation.md).
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
4. Run the checks in `docs/development/validation.md` that match the change.
5. Review the final diff as a user who installed the plugin into another project.

## Completion Criteria

A change is complete when:

- affected plugin manifests, skill metadata, and agent frontmatter remain valid
  for their intended client;
- phase inputs, outputs, and next-step messages agree;
- README examples still match the shipped files;
- relevant repository-wide searches and manual checks pass; and
- contributor documentation is updated when behavior or rationale changed.

There is currently no executable test suite or build system. Do not claim tests
passed when only documentation checks were performed; report the exact checks.

## Scoped Guidance

Add nested `AGENTS.md` files only when a subtree develops genuinely different
rules. Keep repository-wide guidance here and put explanations in
the contributor documentation rather than expanding this file into a handbook.
