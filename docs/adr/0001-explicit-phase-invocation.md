# ADR-0001: Keep workflow phases explicitly invoked

- Status: accepted
- Date: 2026-09-15

QRSPI phases are ordered, consume specific artifacts, include human gates, and
can create worktrees, commits, or pull requests. We keep all eight skills
explicitly invoked so a client cannot run a phase out of order or load workflow
instructions into unrelated tasks.

Claude Code expresses this choice with `disable-model-invocation: true` in each
generated `SKILL.md`; Codex uses `policy.allow_implicit_invocation: false` in
each generated `agents/openai.yaml`. The packager emits these controls only for
the harness that supports them.

## Considered options

- Allow automatic invocation in both clients. This simplifies metadata but
  weakens control over phase order, context use, and side effects.
- Remove Claude's field to share one directly installable tree. This changes
  Claude behavior.
- Duplicate every skill per client. This resolves schema overlap but creates two
  instruction sets that can drift.

## Consequences

Users control when each phase runs. Packaging and tests must preserve the
equivalent harness-specific controls without leaking unsupported metadata.
