# Architecture Decision Records

ADRs preserve historical reasoning that a maintainer cannot reliably recover
from the current code and standard documentation. They are intentionally rare.

## Creation Gate

Create an ADR only when all three conditions are true:

1. **Meaningfully hard to reverse.** Changing the choice later would require
   substantial migration, compatibility work, or disruption.
2. **Surprising without history.** A capable maintainer new to the project could
   reasonably interpret the current design as accidental or try to replace it
   with a more conventional approach.
3. **Chosen from real alternatives for project-specific reasons.** Credible
   options were evaluated, and QRSPI's constraints or goals determined the
   choice.

If any condition is missing, use standard documentation, a code comment, an
issue, or git history instead. An architectural topic does not automatically
deserve an ADR.

## What Belongs in Standard Documentation

Use `docs/development/` for the architecture and practices a maintainer needs
to understand the project as it exists now, including conventional choices and
facts imposed by a platform.

Examples that do **not** need an ADR:

- `plugin/` is the distribution boundary and contains client manifests. This is
  the current plugin structure and belongs in `plugin-packaging.md`.
- Each phase has a `SKILL.md` and `agents/openai.yaml`. This is a file-layout and
  client-metadata convention.
- Skills use YAML frontmatter, JSON manifests must parse, and versions use
  semantic versioning. These are platform or format requirements.
- The validation commands maintainers should run belong in `validation.md`.
- The artifact flow from `task.md` through `plan.md` belongs in
  `workflow-contract.md` unless a non-obvious historical trade-off also needs
  preservation.

## What Merits an ADR

Examples that do qualify:

- **Research cannot read `task.md`.** Giving Research the full task would be the
  simpler conventional design, but QRSPI deliberately accepts an extra phase and
  artifact boundary to reduce solution-shaped research and confirmation bias.
- **Workflow phases remain explicitly invoked across clients.** Automatic
  invocation is conventional for skills, but QRSPI rejects it because phases are
  ordered, include human gates, and can cause side effects. The choice also
  creates a cross-client metadata trade-off worth preserving.
- **One shared skill tree is retained despite incompatible client metadata.** If
  the project evaluates duplicated client-specific skills and accepts a known
  validation limitation to avoid instruction drift, that project-specific
  trade-off should be recorded.

Counterexamples:

- Choosing Markdown for documentation is easy to reverse and unsurprising.
- Adding a required manifest field has no genuine alternative when the platform
  schema mandates it.
- Renaming a skill to fix inconsistent references is maintenance, not an
  architectural decision.
- A preference for a particular heading style is a convention, not an ADR.

## Format and Numbering

Copy [0000-template.md](0000-template.md). Use the next four-digit sequence and
a short kebab-case title, for example `0002-research-task-blindness.md`.

Keep the core record short: state the context, decision, and project-specific
reason in one to three paragraphs. Add considered options or consequences only
when a future maintainer would benefit from them.

Use status only when useful: `proposed`, `accepted`, `deprecated`, or
`superseded by ADR-NNNN`. Never rewrite an accepted ADR to make history look
cleaner; supersede it with a new record.

## Index

- [ADR-0001: Keep workflow phases explicitly invoked](0001-explicit-phase-invocation.md)
