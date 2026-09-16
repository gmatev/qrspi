# Plugin Packaging

Read this document when changing manifests, installation layout, skill metadata,
client compatibility, or release-facing plugin information.

## Distribution Boundary

`plugin/` is the shipped product directory. Contributor documentation and task
artifacts stay outside it.

The repository exposes three packaging surfaces:

- `.claude-plugin/marketplace.json` registers the Claude Code marketplace entry
  and points its source to `./plugin`.
- `plugin/.claude-plugin/plugin.json` describes the Claude Code plugin.
- `plugin/.codex-plugin/plugin.json` describes the Codex plugin and its UI
  presentation.

The manifests have different schemas. Keep shared identity values aligned, but
do not copy client-specific fields blindly between them.

## Shipped Components

- `plugin/skills/qrspi-<phase>/SKILL.md` contains each workflow phase.
- `plugin/skills/qrspi-<phase>/agents/openai.yaml` contains Codex UI metadata and
  invocation policy for that skill.
- `plugin/agents/*.md` contains the Claude Code research agents referenced by
  the workflow skills.

A skill's directory name, `SKILL.md` frontmatter name, invocation shown in the
README and hand-offs, and `$skill-name` in `openai.yaml` must agree.

## Cross-Client Invocation

The workflow phases are user-controlled and ordered, so they are intentionally
explicit-only:

- Claude Code uses `disable-model-invocation: true` in `SKILL.md`.
- Codex uses `policy.allow_implicit_invocation: false` in `agents/openai.yaml`.

Do not remove either control as a cleanup. A change to automatic invocation is a
workflow decision because it affects context usage, phase ordering, and when
side effects can occur.

The current canonical Codex validator rejects Claude's
`disable-model-invocation: true` field even though Claude requires it for the
same explicit-only behavior. Treat this as a known cross-client schema conflict;
do not silently set the field to `false` merely to make one validator green.

## Metadata Consistency

When changing plugin identity or release metadata, check every applicable
surface:

- plugin name;
- semantic version;
- description;
- author or developer name;
- license;
- marketplace source path;
- skill display names, descriptions, and default prompts; and
- README installation, verification, usage, and file-tree examples.

Claude-only or Codex-only presentation fields need not be duplicated when the
other schema has no equivalent.

## Adding or Renaming a Phase

Treat this as an interface migration:

1. Add or rename the skill directory and its `SKILL.md` name.
2. Add or update `agents/openai.yaml` with matching UI metadata and invocation
   policy.
3. Update every upstream and downstream hand-off and recovery reference.
4. Update the README workflow table, examples, and file tree.
5. Update `workflow-contract.md` and any affected ADR.
6. Run the applicable L1 tests described in `testing.md`, or its transitional
   manual checks until that suite exists.

## Release Review

Before release, validate both manifests independently, all eight skills, and the
actual archive boundary. A passing Codex validator does not validate the Claude
manifest or marketplace entry; a successful Claude installation does not prove
the Codex UI metadata is complete.
