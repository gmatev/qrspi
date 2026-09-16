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

L1 proves that the shipped plugin is structurally valid and internally
consistent without invoking an AI model or external service.

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
└── helpers/        # shared discovery and parsing code
```

For the current L1 suite:

- **Smoke tests** confirm that the distribution boundary exists, required
  manifests and skill files are present, and structured files can be parsed.
- **Integration tests** prove relationships across files, such as workflow
  hand-offs, artifact flow, README examples, and cross-client metadata parity.

Add `unit/`, `fixtures/`, or `e2e/` only when a concrete test requires them.
There is currently no isolated production logic that merits a unit-test suite,
and end-to-end tests are outside L1.

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

- `plugin/` is the shipped product boundary.
- Both client manifests and all eight phase skills exist in their expected
  locations.
- JSON, YAML, and skill frontmatter parse successfully.
- The Claude marketplace entry points to `./plugin`.

### Skill metadata

- A skill directory, its frontmatter name, and its Codex metadata identify the
  same skill.
- Claude and Codex both preserve explicit-only phase invocation.
- Research-agent references resolve to shipped agent definitions.

### Workflow contract

- Every phase hand-off names an existing skill.
- Declared inputs and outputs form the documented artifact chain.
- README invocations and artifact names agree with the shipped skills.
- Research remains task-blind: its declared input is `questions.md`, not
  `task.md` or a task description.
- Human gates and backward-routing instructions remain present where the
  workflow contract requires them.

### Cross-client packaging

- Shared identity fields agree where both manifest schemas expose them.
- Client-specific metadata is validated against that client's requirements,
  not copied blindly between schemas.
- Tests assert the intended explicit-invocation behavior directly rather than
  requiring one client's validator to accept the other client's fields.

## Assertion Design

- Assert stable structure and contracts before prompt wording.
- Prefer parsing structured data over searching it with regular expressions.
- Use exact matches for identifiers, paths, phase order, and artifact names.
- Use targeted presence or pattern assertions for natural-language
  instructions; avoid snapshots of entire prompts.
- Include negative assertions for critical prohibitions, especially Research's
  task blindness.
- Make failures identify the file and contract that drifted.
- Test public files under `plugin/`; do not turn contributor-document wording
  into a product contract unless consistency with the shipped plugin matters.

## Bun Test Commands

The standard commands are:

```bash
bun install
bun test
bun run test:smoke
bun run test:integration
bun run typecheck
bun test ./tests/integration/workflow-contract.test.ts
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
- release, installer, or operating-system matrices; or
- L2/L3 fixtures created in anticipation of unspecified tests.

## Current Suite

Changes to shipped plugin files are complete only when the relevant focused
tests, `bun test`, and `bun run typecheck` pass.
