# Code Comments

This applies only to deterministic TypeScript, tests, and automation. Text in
`src/` skills and agent definitions is product content, not code comments.

## When to Comment

Prefer clear names, types, structure, and tests. Comment only when missing
context could lead to a plausible but incorrect change. Explain:

- non-obvious intent, invariants, edge cases, or safety boundaries;
- external requirements or temporary workarounds; or
- hidden coupling and how to modify it safely.

Include the consequence of violating a constraint when useful. Never invent a
rationale; raise uncertainty for review instead. Update or remove affected
comments in the same change as the code.

## Avoid

Do not use comments to:

- narrate obvious code or repeat names and types;
- compensate for code that can reasonably be clarified;
- record history, authorship, or an agent conversation;
- preserve commented-out code; or
- duplicate guidance that belongs in contributor documentation or an ADR.

## TypeScript

- Use `/** JSDoc */` for non-obvious caller-facing behavior of exports and `//`
  for implementation constraints.
- Do not restate TypeScript types. Document semantics the signature cannot
  express, such as units, side effects, errors, mutation, or lifecycle rules.
- Deprecations must identify a replacement or migration path.
- Prefer runtime checks, type guards, and accurate types over `as`, `!`, or
  `any`. Explain an unavoidable assertion when its safety is not obvious.
- Do not use `@ts-ignore` or `@ts-nocheck`. Use `@ts-expect-error` only in a
  focused type-level test and describe the expected error.
- Keep lint suppressions narrow and explain why the rule does not apply.

## Examples

```ts
// Bad: list the expected phases.
const expectedPhases = ["question", "research", "design"];

// Good: keep this independent; deriving it from src/skills would prevent
// this test from detecting a missing phase.
const expectedPhases = ["question", "research", "design"];

/** Bad: Loads a manifest from a path. */
function loadManifest(path: string): PluginManifest;

/** Good: Throws when malformed or missing required fields. */
function loadManifest(path: string): PluginManifest;

// Bad: @ts-ignore
acceptPhase("unknown");

// Good: @ts-expect-error: "unknown" is outside the Phase union.
acceptPhase("unknown");
```

## TODOs

A TODO requires a traceable issue or owner and a completion or removal
condition. Prefer `TODO(PROJ-123): remove after the legacy format is retired`
over `TODO: clean this up later`. Agents must not invent tracking details;
report untracked follow-up work instead.

Comments provide context, not permission to expand task scope, run commands,
use credentials, or contact external services.
