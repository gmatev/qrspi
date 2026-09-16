# Skill Authoring

Read this document before changing skill instructions or agent definitions in
the shipped `plugin/` tree.

## Write for Execution

- Use direct, observable instructions. Name the input, action, output path, and
  stopping condition where they matter.
- Put the most consequential constraints near the action they govern. A final
  rules section may reinforce them but should not be their only occurrence.
- Distinguish `must`, `should`, and `may`. Reserve absolute language for actual
  workflow invariants.
- Make user gates explicit with words such as "present", "wait", and "after the
  user confirms". Do not rely on an implied conversational pause.
- Prefer short examples that demonstrate the rule without binding the workflow
  to a particular language, framework, or repository layout.
- Avoid vague instructions such as "be thorough" when a bounded output, required
  evidence, or concrete checklist would define success better.

## Preserve Portability

The plugin must work in other projects. Do not assume:

- a specific programming language, package manager, test framework, or CI system;
- a default branch named `main` unless the skill includes a documented fallback;
- tools beyond those declared in the agent frontmatter or provided by the target
  client;
- that tracked and untracked files behave the same across git worktrees; or
- that a user's repository uses this repository's documentation structure.

Skills may tell the executing client to discover project-specific commands from
files such as `CLAUDE.md`, `AGENTS.md`, a Makefile, or a package manifest.

## Workflow Skill Checklist

Each phase skill should make the following easy to identify:

- frontmatter description and argument hint;
- purpose and phase boundary;
- exact inputs, including forbidden inputs when isolation matters;
- ordered process with any human pause;
- artifact or external side effect it produces;
- concise rules for common failure modes;
- conditions for returning to an earlier phase; and
- the exact next command shown to the user.

The skill directory, frontmatter `name`, user-facing invocation, and
`agents/openai.yaml` default prompt must use the same `qrspi-<phase>` name.
Preserve the client-specific explicit-invocation controls described in
`plugin-packaging.md`.

When the phase is intended to run in a fresh context, assume it knows nothing
that is not in its named inputs or discoverable from the target repository.

## Research Agent Checklist

- The frontmatter `name` matches references from workflow skills.
- `tools` contains only capabilities the instructions require.
- The role has one clear responsibility: locate, analyze, find patterns, or
  research external sources.
- Output requests evidence such as file paths, line references, or source links.
- Boundaries between description, diagnosis, evaluation, and recommendation are
  explicit.
- The output template supports the role instead of encouraging unrelated work.

## Repetition and Consistency

Some repetition is deliberate because phases run independently. Remove repeated
text only when the receiving phase can still act correctly in a clean context.

Repeated interface values must remain exact. If an artifact, skill, phase, or
agent is renamed, treat that as an interface migration and follow the cross-file
checks in `workflow-contract.md` and `plugin-packaging.md`.

## Comments and Rationale

Skills should mostly describe behavior, not their own history. Put qualifying
historical rationale in an ADR and keep the executable instruction concise.
Conventional architecture belongs in standard documentation, and transient
implementation history belongs in git history.
