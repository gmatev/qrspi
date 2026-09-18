# Testing

This document defines how QRSPI is tested with Bun and TypeScript.

The first implementation is deliberately limited to Layer 1. Higher layers are
recorded only to make the intended direction clear; they are not current test
requirements.

## Test Pyramid

```text
            /\
           /  \      WORKFLOW — full workflows, artifact and experience verification
          / L3 \     Suite: e2e  ·  Status: future
         /------\
        /        \    PHASE — one phase with controlled inputs, verify artifacts and gates
       /   L2     \   Status: future
      /------------\
     /              \  PROTOCOL — contracts, structure, metadata, and cross-references
    /      L1        \ Suites: smoke + integration  ·  When: every change (`bun test`)
   /------------------\
```

### L1: Protocol

L1 proves that canonical source and generated distributions are structurally
valid and internally consistent without invoking an AI model or external
service. It also executes the deterministic CLI against temporary real Git
repositories, so task, worktree, phase, and failure behavior are verified at
their filesystem boundary.

L1 tests must be:

- deterministic and offline;
- fast enough to run after every change;
- native TypeScript tests executed by Bun;
- independent of a locally installed Claude Code or Codex client; and
- focused on durable product contracts rather than incidental prose.

This is the only layer QRSPI will implement for now.

### L2: Phase

L2 would execute one workflow phase against controlled inputs and verify its
artifacts and stopping behavior. These tests may require a client or model and
will be designed only when L1 is established and a concrete need appears.

### L3: Workflow

L3 would exercise a complete QRSPI workflow and evaluate cross-phase coherence
and user-visible outcomes. These tests are intentionally out of scope for the
initial suite.

## Test Organization

Tests are grouped by the kind of boundary they exercise, independently of the
pyramid layer:

```text
tests/
├── smoke/          # required files, parseability, and basic package shape
├── integration/    # contracts spanning multiple shipped files
├── unit/           # deterministic packaging behavior and failure handling
└── helpers/        # shared discovery and parsing code
```

For the current L1 suite:

- **Smoke tests** confirm that canonical source and both generated distribution
  trees contain the expected skills and agents and that structured files parse.
- **Integration tests** prove relationships across files, such as workflow
  hand-offs, artifact flow, harness adaptations, installation, and README
  examples.
- **Unit tests** exercise isolated package behavior such as complete model
  mappings, stale-output removal, and validation before replacement.

Add `fixtures/` or `e2e/` only when a concrete test requires them. End-to-end
client execution remains outside L1.

Create `fixtures/` and `helpers/` only when tests actually share those
resources. Empty placeholder directories add no value.

Test files use descriptive names ending in `.test.ts`, for example:

```text
tests/smoke/distribution.test.ts
tests/integration/workflow-contract.test.ts
```

Do not assign numeric test identifiers unless the project later gains a real
need for stable external IDs, registry entries, or numeric filtering.

## Initial L1 Coverage

The current suite covers these contracts:

### Distribution shape

- `src/` contains the top-level router, all seven canonical phase skills, the
  setup skill, and four canonical agents.
- Harness configuration covers every agent exactly once.
- Claude output mirrors `.claude/{skills,agents}` and uses Markdown agents.
- Codex output mirrors `.agents/skills` and `.codex/agents` and uses TOML
  agents.
- TOML, YAML, and skill frontmatter parse successfully.

### Skill metadata

- A skill directory, its frontmatter name, and its Codex metadata identify the
  same skill.
- Claude and Codex both preserve explicit-only phase invocation.
- Research-agent references resolve to shipped agent definitions.
- Harness-specific models are injected without leaving unsupported Codex fields.

### Workflow contract

- Every phase hand-off names an existing skill.
- Declared inputs and outputs form the documented artifact chain.
- README invocations and artifact names agree with the shipped skills.
- Research remains task-blind: its declared input is `questions.md`, not
  `task.md` or a task description.
- Human gates and backward-routing instructions remain present where the
  workflow contract requires them.
- Setup remains argumentless, explicit-only, and aligned with the fixed managed
  task and worktree paths used by the router and README.
- One-phase resume, current-phase re-entry, rewind, forward-jump rejection,
  shallow evidence, Research isolation, and terminal `done` routing remain
  deterministic.
- Task bootstrap delegates eligibility to `git worktree add`, creates from
  `HEAD`, and leaves staged, unstaged, and untracked main-worktree changes out
  of the managed worktree.

### Packaging and installation

- Every package run removes stale generated files.
- Invalid harness mappings fail before replacing an existing distribution.
- Reinstalling identical files is idempotent.
- Conflicting project files are rejected by default and replaced only with
  explicit `--force` behavior.
- Runtime tools and lifecycle hooks are packaged outside skill directories.
- Hook context resolves main, nested, and linked-worktree locations and emits
  an unavailable binding when the runtime is absent.
- Installation preserves unrelated project hooks and settings, is idempotent,
  replaces only QRSPI-owned hook entries with `--force`, and rejects concurrent
  Codex inline-hook configuration before writing.
- Tests assert explicit-invocation behavior in each generated schema.

## Assertion Design

- Assert stable structure and contracts before prompt wording.
- Prefer parsing structured data over searching it with regular expressions.
- Use exact matches for identifiers, paths, phase order, and artifact names.
- Use targeted presence or pattern assertions for natural-language
  instructions; avoid snapshots of entire prompts.
- Include negative assertions for critical prohibitions, especially Research's
  task blindness.
- Make failures identify the file and contract that drifted.
- Test canonical files under `src/` and generated contracts through temporary
  package output; do not commit or edit `dist/` fixtures.

## Bun Test Commands

The standard commands are:

```bash
bun install
bun run package
bun test
bun run test:smoke
bun run test:integration
bun run typecheck
bun test ./tests/integration/workflow-contract.test.ts
bun test ./tests/integration/task-bootstrap.test.ts
bun test ./tests/integration/phase-routing.test.ts
bun test ./tests/integration/implementation-routing.test.ts
bun test ./tests/integration/pr-terminal.test.ts
```

`bun test` is the authoritative full L1 command. Avoid adding a custom test
runner until the native Bun runner demonstrably cannot support a required
workflow.

## Adding an L1 Test

1. Identify the durable product contract that could regress.
2. Choose the narrowest appropriate suite: smoke or integration. Add a unit
   test only when isolated deterministic logic provides a genuine seam.
3. Reuse a helper or fixture only when it removes meaningful duplication.
4. Add the smallest assertion set that proves the contract and its important
   failure mode.
5. Run the focused test, then run the complete L1 suite with `bun test`.
6. Update this document only when the testing methodology or coverage boundary
   changes, not for every new test file.

## Out of Scope for L1

Do not add the following to the current L1 suite:

- live AI model or client invocation;
- network access or credential checks;
- generated coverage registries;
- custom concurrency or profile flags;
- shell-based test runners or compatibility wrappers;
- full prompt snapshots;
- release or operating-system installer matrices; or
- L2/L3 fixtures created in anticipation of unspecified tests.

## Current Suite

Changes to source, harness configuration, packaging, or installation are
complete only when the relevant focused CLI or contract tests, `bun run
package`, the authoritative full `bun test`, and `bun run typecheck` pass.
