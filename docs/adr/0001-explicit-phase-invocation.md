# ADR-0001: Keep workflow phases explicitly invoked

- Status: accepted
- Date: 2026-09-15

QRSPI phases are ordered, consume specific artifacts, include human gates, and
can create worktrees, commits, or pull requests. We keep all eight skills
explicitly invoked so a client cannot run a phase out of order or load workflow
instructions into unrelated tasks.

Claude Code expresses this choice with `disable-model-invocation: true` in each
`SKILL.md`; Codex uses `policy.allow_implicit_invocation: false` in each
`agents/openai.yaml`. We retain both controls even though the current Codex
validator rejects Claude's field in the shared skill tree.

## Considered options

- Allow automatic invocation in both clients. This simplifies metadata but
  weakens control over phase order, context use, and side effects.
- Set Claude's field to `false` to satisfy Codex validation. This silently
  changes Claude behavior.
- Duplicate every skill per client. This resolves schema overlap but creates two
  instruction sets that can drift.

## Consequences

Users control when each phase runs. Release validation must surface the known
cross-client schema conflict until packaging or validator support resolves it.
