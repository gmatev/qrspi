# Skill Authoring

Read this document before changing skill instructions or agent definitions in
the canonical `src/` tree.

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

## Bound Values and Placeholders

Always represent a value that a skill binds from user input, structured output,
or an earlier step with angle-bracket notation such as `<task-id>` or
`<task-directory>`. State once where the value comes from, then reuse the same
placeholder consistently in prose, command templates, and payload examples. Use a
more specific placeholder than `<value>` so the binding remains unambiguous in a
fresh context.

`<HARNESS_DIR>` is a reserved binding supplied by the installed lifecycle hook.
Skills may consume it in commands such as
`bun "<HARNESS_DIR>/tools/qrspi.ts"`, but must never derive, assign, or refresh
it. If the binding is unavailable, a skill stops and asks the user to install
QRSPI in the current worktree; it does not fall back to a relative path or run
Git to guess the harness directory.

## Loading other skills

When one skill needs to use shared methodology or to leverage another skill,
load and follow the instructions instead of calling through a tool.

Examples:

- PREFER: "Load and follow skill `qrspi-question` ..."
- AVOID: "Use the Skill tool to call `qrspi-question` ..."

## Preserve Portability

QRSPI must work in other projects. Do not assume:

- a specific programming language, package manager, test framework, or CI system;
- a default branch named `main` unless the skill includes a documented fallback;
- tools beyond those declared in canonical agent frontmatter or provided by the
  target client;
- that tracked and untracked files behave the same across git worktrees; or
- that a user's repository uses this repository's documentation structure.

Skills may tell the executing client to discover project-specific commands from
files such as `CLAUDE.md`, `AGENTS.md`, a Makefile, or a package manifest.

## Shipped Skill Checklist

`setup-qrspi` is a configuration utility outside the ordered workflow. It must
remain argumentless and explicit-only, preview all repository-file changes, and
wait for confirmation before writing. Keep its configuration path, field,
default, owned `AGENTS.md` heading, and ignore-rule label aligned with the
workflow and user documentation.

## Workflow Skill Checklist

Every phase supports two entry models: a composed envelope from
`/qrspi --resume`, and direct `/qrspi-<phase> [--task-id <task-id>]` invocation.
Direct entry loads the router's shared resume reference; both models then call
the deterministic engine. The main agent owns engine calls. Subagents do not
invoke the engine, inspect `task.json`, or choose workflow phases.

Keep each phase's `## Input`, entry/artifact contract, `## Completion`, and
`## Output` explicit. The entry section names the exact allowed inputs and
output, requires the expected engine response, and consumes only returned
absolute paths. Completion validates only after the user gate. Output reports
accepted evidence and, except at terminal PR, shows both `/qrspi --resume` and
the direct next-phase command.

Each phase skill should make the following easy to identify:

- frontmatter description and argument hint;
- purpose and phase boundary;
- exact inputs, including forbidden inputs when isolation matters;
- ordered process with any human pause;
- artifact or external side effect it produces;
- concise rules for common failure modes;
- conditions for returning to an earlier phase; and
- the exact next command shown to the user.

The skill directory, frontmatter `name`, user-facing invocation, and generated
Codex `agents/openai.yaml` default prompt must use the same `qrspi-<phase>` name.
The packager derives Codex metadata from canonical frontmatter; do not maintain
a parallel metadata source. Preserve the client-specific explicit-invocation
controls described in `distribution-packaging.md`.

When the phase is intended to run in a fresh context, assume it knows nothing
that is not in its named inputs or discoverable from the target repository.

## Research Agent Checklist

- The frontmatter `name` matches references from workflow skills.
- `tools` contains only capabilities the instructions require.
- Model selection is omitted from canonical frontmatter and defined for every
  agent in both harness `agents.toml` files.
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
checks in `workflow-contract.md` and `distribution-packaging.md`.

Apply the rule of three to repeated implementation: keep the first occurrence
local, treat the second as a refactor candidate, and extract the third unless a
phase needs repetition to remain correct in a clean context. Extract earlier
when correctness or public-interface drift demands it. Research isolation
takes priority over deduplication. For repeated public contracts, update the
canonical definition, every consumer, and the focused test in one change.

## Comments and Rationale

Skills should mostly describe behavior, not their own history. Put qualifying
historical rationale in an ADR and keep the executable instruction concise.
Conventional architecture belongs in standard documentation, and transient
implementation history belongs in git history.
