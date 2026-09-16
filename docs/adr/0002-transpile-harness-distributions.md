# ADR-0002: Author once and transpile per harness

- Status: accepted
- Date: 2026-09-15

QRSPI supports Claude Code and Codex, whose skill and agent schemas differ.
Maintaining complete client-specific source trees would make prompt drift likely,
while a custom neutral intermediate representation would make every instruction
harder to author and review.

We keep one canonical, Claude-shaped Markdown source tree under `src/` and put
harness-owned model mappings under `harness/<harness>/`. A deterministic
packaging step validates those inputs and emits directly installable project
layouts under ignored `dist/<harness>/` directories. Claude output stays close
to source. Codex output converts agents to TOML, filters unsupported
frontmatter, rewrites skill invocation syntax, and derives Codex-only skill
metadata from canonical frontmatter.

## Considered options

- Maintain separate Claude and Codex source trees. Each tree would be native,
  but shared workflow instructions could diverge silently.
- Define a fully neutral schema and render both clients from it. This would be
  structurally pure but would introduce a bespoke authoring language for mostly
  Markdown content.
- Keep one mixed, directly installable tree. This is simple to publish but
  exposes each client to metadata intended for the other.

## Consequences

Source is shared semantically but intentionally Claude-shaped syntactically.
Harness configuration must cover every agent, generated output must never be
edited as source, and packaging becomes a required validation and release step.
Direct project installation replaces plugin manifests until plugin packaging is
reintroduced deliberately.
