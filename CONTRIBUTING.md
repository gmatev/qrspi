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
| Manifests, installation layout, client metadata, or releases | [Plugin packaging](docs/development/plugin-packaging.md) | Preserve the cross-client distribution contract |
| Consistency checks, review, or release readiness | [Validation](docs/development/validation.md) | Select and report proportionate checks |
| A surprising, hard-to-reverse project choice with real alternatives | [ADRs](docs/adr/README.md) | Recover or preserve historical rationale |

Read the smallest useful set. A wording correction in one skill normally needs
only the skill-authoring guide. Renaming a skill also affects the workflow
contract, plugin packaging, and validation guidance.

## Repository Boundaries

- `plugin/` is the shipped product.
- `.claude-plugin/marketplace.json` registers the Claude Code marketplace entry.
- `plugin/.claude-plugin/plugin.json` and
  `plugin/.codex-plugin/plugin.json` are client-specific manifests.
- `plugin/skills/` contains the eight workflow phases.
- `plugin/agents/` contains the bundled research agents.
- `docs/development/` documents the current architecture and contributor
  practices.
- `docs/adr/` preserves the rationale for qualifying historical decisions.

Keep repository-only guidance and task artifacts outside `plugin/`.

## Contribution Process

1. Read each affected file fully and identify upstream and downstream phases.
2. Identify the workflow invariant or ADR affected, if any.
3. Make the smallest coherent change, including cross-file terminology updates.
4. Run the checks in [validation.md](docs/development/validation.md) that match
   the change.
5. Review the final diff from the perspective of someone installing the plugin
   into an unrelated repository.

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

## Completion Checklist

- Plugin manifests and changed frontmatter remain valid for their intended
  clients.
- Phase inputs, outputs, artifact names, and next-step messages agree.
- README examples match the shipped files.
- Relevant structural searches and manual checks pass.
- Contributor documentation is updated when behavior or rationale changes.

QRSPI currently has no executable test suite or build system. Report the exact
documentation and structural checks performed rather than saying that tests
passed.
