# Contributing to QRSPI

Thank you for improving QRSPI. This guide is the shared entry point for all
contributors.

Read [README.md](README.md) first for the user-facing workflow, installation
contract, and repository layout. Then load only the technical guidance relevant
to your change.

## Documentation Router

| When the change concerns | Read | Why |
| --- | --- | --- |
| Phase order, artifact flow, allowed inputs, or hand-offs | [Workflow contract](docs/development/workflow-contract.md) | Preserve or deliberately revise cross-phase invariants |
| Skill wording, frontmatter, agent roles, or examples | [Skill authoring](docs/development/skill-authoring.md) | Keep instructions clear, testable, and portable |
| Packaging scripts, installation layout, generated metadata, or releases | [Distribution packaging](docs/development/distribution-packaging.md) | Preserve the cross-harness distribution contract |
| Test methodology, coverage, or release readiness | [Testing](docs/development/testing.md) | Understand the test pyramid and current L1 boundary |
| Code comments, API documentation, or TODOs | [Commenting](docs/development/commenting.md) | Preserve intent without narrating or inventing rationale |
| A surprising, hard-to-reverse project choice with real alternatives | [ADRs](docs/adr/README.md) | Recover or preserve historical rationale |

Read the smallest useful set. A wording correction in one skill normally needs
only the skill-authoring guide. Renaming a skill also affects the workflow
contract, distribution packaging, and testing guidance.

## Repository Boundaries

- `src/` is the canonical shared source, authored in Claude-compatible Markdown.
- `harness/` contains client-specific model mappings and project hook
  configuration templates.
- `scripts/package.ts` transpiles both harness distributions into ignored
  `dist/` output.
- `scripts/install.ts` installs one selected harness into a project root.
- `src/skills/` contains the top-level `qrspi` router, seven workflow phase
  consumers, and the `setup-qrspi` configuration utility.
- `src/agents/` contains the bundled research-agent instructions.
- `src/tools/` contains the deterministic task-state, routing, validation, and
  worktree runtime. Phase skills consume its projected paths; they do not
  independently derive workflow state. `src/hooks/` contains the shared
  harness-context hook.
- `docs/development/` documents the current architecture and contributor
  practices.
- `docs/adr/` preserves the rationale for qualifying historical decisions.

Keep repository-only guidance and task artifacts outside `src/` and generated
`dist/` output.

## Contribution Process

1. Read each affected file fully and identify upstream and downstream phases.
2. Identify the workflow invariant or ADR affected, if any.
3. Make the smallest coherent change, including cross-file terminology updates.
4. Run the applicable tests and transitional checks in
   [testing.md](docs/development/testing.md).
5. Review the generated Claude and Codex trees and install them into temporary
   project roots.

## Documentation Principles

- Write technical documentation for contributors rather than for a particular
  development tool.
- Keep current architecture, file layout, platform requirements, and operating
  procedures in `docs/development/`.
- Use ADRs sparingly. They exist for non-obvious historical trade-offs, not as a
  catalog of conventional architecture.
- Keep end-user installation and usage in `README.md`.
- Keep temporary research, plans, and investigation notes with the task that
  produced them unless the information is durable and reusable.
- Remove or revise stale documentation in the same change that makes it stale.
- Treat comments as maintained source: update or remove nearby comments when a
  change makes them inaccurate or redundant.

## Completion Checklist

- Canonical frontmatter, harness configuration, and generated definitions remain
  valid for their intended clients.
- Phase inputs, outputs, artifact names, and next-step messages agree.
- README examples match the shipped files.
- Relevant automated tests and required manual checks pass.
- Contributor documentation is updated when behavior or rationale changes.

Run `bun run package`, `bun test`, and `bun run typecheck` for changes to
deterministic project code or shipped distribution contracts. Report
documentation-only checks precisely rather than describing them as tests.
