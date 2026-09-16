# Distribution Packaging

Read this document when changing installation layout, harness configuration,
skill metadata, generated agent definitions, or release-facing distribution
behavior.

## Source and Distribution Boundaries

`src/` is the canonical shared product source. It uses Claude-compatible
Markdown because Claude agent and skill definitions are a practical authoring
format, but prompt bodies and workflow behavior remain shared across harnesses.

Harness-specific values live under `harness/`:

- `harness/claude/agents.toml` maps every agent to its Claude model.
- `harness/codex/agents.toml` maps every agent to its Codex model.

Codex skill UI metadata is generated from canonical skill frontmatter. The
packager also applies the explicit-invocation policy as a fixed rule; neither is
maintained as parallel source configuration.

For each skill, packaging derives `display_name`, uses the canonical
`description` as `short_description`, builds a default `$skill` prompt, and sets
`policy.allow_implicit_invocation` to `false`. Workflow skills use the
`QRSPI <Phase>` convention; `setup-qrspi` uses `Setup QRSPI` and a
configuration-specific prompt.

`scripts/package.ts` always builds both harnesses. It validates the complete
source/configuration relationship before replacing `dist/`, then emits:

```text
dist/
├── claude/
│   └── .claude/
│       ├── agents/*.md
│       └── skills/*/SKILL.md
└── codex/
    ├── .agents/skills/*/
    │   ├── SKILL.md
    │   └── agents/openai.yaml
    └── .codex/agents/*.toml
```

`dist/` is generated and gitignored. Never make a direct edit there the source
of a fix.

## Harness Transformations

Claude packaging copies each canonical skill and adds the configured `model`
to each Markdown agent's frontmatter. It does not include Codex-only
`agents/openai.yaml` metadata.

Codex packaging:

- converts each Markdown agent into a standalone TOML agent definition;
- maps the Markdown body to `developer_instructions`;
- adds the configured Codex `model`;
- omits Claude-only `tools` and invocation fields from agents;
- filters skill frontmatter to the supported `name`, `description`, and
  `argument-hint` fields;
- rewrites Claude `/qrspi-*` invocations to Codex `$qrspi-*` invocations; and
- generates Codex `agents/openai.yaml` metadata for each skill.

Reasoning effort is intentionally not configured. Codex resolves it through
its normal defaults.

## Cross-Client Invocation

The workflow phases are user-controlled and ordered, and setup edits tracked
repository files, so all shipped skills remain explicit-only:

- Claude output retains `disable-model-invocation: true` in every `SKILL.md`.
- Codex output omits that unsupported field and uses
  `policy.allow_implicit_invocation: false` in every `agents/openai.yaml`.

The harness-specific output resolves the previous shared-tree schema conflict
without duplicating workflow instructions.

## Adding or Renaming an Agent

Treat an agent name as a cross-harness interface:

1. Add or rename its canonical Markdown file under `src/agents/`.
2. Keep the filename and frontmatter `name` identical.
3. Add an entry to both harness `agents.toml` files.
4. Update all skill references to the agent.
5. Run `bun run package`, `bun test`, and `bun run typecheck`.

Packaging rejects missing, extra, or duplicate agent mappings.

## Adding or Renaming a Shipped Skill

Treat a shipped skill name as an interface migration:

1. Add or rename the canonical skill directory and its `SKILL.md` name.
2. For a phase, update every upstream and downstream hand-off and recovery
   reference.
3. Update the README workflow table, examples, and source tree.
4. Update `workflow-contract.md` and any affected ADR.
5. Run `bun run package`, `bun test`, and `bun run typecheck`.

## Installation Contract

`scripts/install.ts <claude|codex> <destination> [--force]` rebuilds both
distributions and installs the selected tree into an existing project root.
Identical files are left unchanged. Different existing files cause the entire
install to fail before copying unless `--force` is present.

There is no plugin manifest or marketplace distribution in the current design.
Direct project installation is the supported mechanism.

## Release Review

Before release:

1. Run `bun run package` and inspect both generated trees.
2. Run `bun test` and `bun run typecheck`.
3. Install each harness into a temporary project root.
4. Verify all shipped skills and four agents are discoverable by the intended
   client.
