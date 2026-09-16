# Validation

QRSPI currently has no build or executable test suite. Validation is therefore
a combination of structural searches and a deliberate skill review. Report the
checks actually performed; do not summarize them as automated tests.

## Baseline Checks

Run these after any skill or workflow change:

```bash
git diff --check
git diff -- README.md CONTRIBUTING.md .claude-plugin plugin AGENTS.md docs
find plugin -type f | sort
rg --hidden -n -g 'README.md' -g 'CONTRIBUTING.md' -g 'plugin/**' -g 'docs/**' '/qrspi-(question|research|design|structure|plan|worktree|implement|pr)|task\.md|questions\.md|research\.md|design\.md|structure\.md|plan\.md' .
rg --hidden -n -g 'README.md' -g 'CONTRIBUTING.md' -g 'plugin/**' -g 'docs/**' 'codebase-locator|codebase-analyzer|codebase-pattern-finder|web-search-researcher' .
```

Use the search output to inspect consistency; a successful exit code alone does
not prove the references are correct.

## Frontmatter Review

For every changed skill or agent-definition file under `plugin/`:

- opening and closing `---` delimiters are present;
- `name` values match the directory or agent filename and all references;
- `description` still matches the skill or agent's actual behavior;
- declared tools support the instructions without unnecessary capabilities;
- skill `argument-hint` values match the documented input; and
- model fields, when present, are intentional rather than copied accidentally.

For every changed workflow skill, also confirm that `agents/openai.yaml` has
matching interface metadata and preserves the intended invocation policy.

## Workflow Review

Trace the changed path as a user:

1. Start from the relevant README skill invocation.
2. Confirm the skill can find every input it names.
3. Confirm its output has the filename and structure expected downstream.
4. Confirm any required user pause happens before the side effect or decision.
5. Confirm the next-skill invocation exists and receives the right argument.
6. Confirm recovery instructions point to a phase that can repair the problem.

For changes to phase 2, explicitly verify that no instruction reveals or reads
the task goal. For changes to phases 3-7, verify that required human gates and
progress markers are not accidentally bypassed.

## Portability Review

Read the changed skill as if it were installed into an unrelated repository:

- Are paths repository-relative or intentionally derived at runtime?
- Are project-specific commands discovered instead of assumed?
- Do shell examples handle spaces and untracked worktree artifacts where relevant?
- Does the skill depend only on declared or standard capabilities?
- Would a fresh context know everything required to complete the phase?

For plugin packaging changes, also:

- parse all three JSON files with `python3 -m json.tool`;
- confirm `.claude-plugin/marketplace.json` still points to `./plugin`;
- confirm shared name, version, description, author, and license values agree
  where both client schemas expose them;
- run the Codex plugin validator when it is available; and
- confirm that contributor guidance or task artifacts are not included in
  `plugin/` accidentally.

## Documentation-Only Changes

For changes confined to `AGENTS.md`, `CONTRIBUTING.md`, or `docs/`, at minimum
run `git diff --check`, inspect all relative links, and review the diff. If the
documentation changes the workflow contract, perform the full workflow review
even when no shipped skill changed.
