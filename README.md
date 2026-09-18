# QRSPI

**Question, Research, Design, Structure, Plan, Implement, PR** — a seven-phase
workflow for Claude Code and Codex that breaks complex coding tasks
into focused skills with clear artifacts between each step.

## The Problem

The original [Research-Plan-Implement](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents) (RPI) workflow used 3 monolithic prompts with 85+ instructions each. Two things went wrong:

1. **Instruction budget overflow.** LLMs follow ~150-200 instructions reliably. A single 85-instruction prompt plus CLAUDE.md, tools, and MCP left little room. Steps got skipped — especially the interactive ones that required "magic words" to trigger.
2. **Decisions made too early.** By the time you saw the 1000-line plan, the agent had already made all the design decisions. Correcting course meant re-doing expensive work.

## The Solution

Split research into 2 phases, planning into 3 phases, and implementation into 3 phases. Each phase:

- Is designed to run in a fresh context window
- Reads only its designated input artifacts
- Produces a markdown file that feeds the next phase
- Stays under 40 instructions

```
Question → Research → Design → Structure → Plan → Implement → PR
```

| # | Phase | What it does | Output |
|---|-------|-------------|--------|
| 1 | **Question** | Decomposes the task into neutral research questions | `questions.md` |
| 2 | **Research** | Answers questions with facts only — never sees the task | `research.md` (~300 lines) |
| 3 | **Design** | Uses a scoped, dependency-ordered interview to align on the approach | `design.md` (~200–500 lines) |
| 4 | **Structure** | Breaks design into vertical slices with test checkpoints | `structure.md` (~2 pages) |
| 5 | **Plan** | Tactical implementation details for the agent | `plan.md` |
| 6 | **Implement** | Executes plan slices, verifies them, and commits each | code changes and updated `plan.md` |
| 7 | **PR** | Creates a pull request grounded in the design and plan | `pr.md` and terminal task state |

The human reviews Design (~200–500 lines, scaled to the task) and Structure
(~2 pages) — not a 1000-line plan. By the time code is written, alignment has
already happened.

## Install

QRSPI installs directly into a project for either Claude Code or Codex. The
installer rebuilds both harness distributions before copying the selected one.

### Install for Claude Code

```bash
git clone https://github.com/gmatev/qrspi /tmp/qrspi
cd /tmp/qrspi
bun install --frozen-lockfile
bun scripts/install.ts claude /path/to/project
```

This installs skills under `.claude/skills/`, Markdown agent definitions under
`.claude/agents/`, the deterministic runtime under `.claude/tools/`, and the
QRSPI context hook under `.claude/hooks/`. The installer merges QRSPI's
`SessionStart` and worktree-rebinding hooks into `.claude/settings.json` while
preserving unrelated settings and hooks.

### Install for Codex

```bash
git clone https://github.com/gmatev/qrspi /tmp/qrspi
cd /tmp/qrspi
bun install --frozen-lockfile
bun scripts/install.ts codex /path/to/project
```

This installs skills under `.agents/skills/`, TOML agent definitions under
`.codex/agents/`, the deterministic runtime under `.codex/tools/`, and the
QRSPI `SessionStart` hook under `.codex/hooks/`. The installer merges the hook
into `.codex/hooks.json`. It stops if `.codex/config.toml` already defines
inline hooks, because Codex warns when both hook sources are active.

The installer leaves identical files unchanged and refuses to replace modified
files. Pass `--force` only when you intend to replace conflicting QRSPI files:

```bash
bun scripts/install.ts codex /path/to/project --force
```

Review and trust the installed project hooks when the client prompts you. At
session start, the hook binds `<HARNESS_DIR>` to the current worktree's
`.claude` or `.codex` directory. Claude Code refreshes that binding after
`EnterWorktree` and `ExitWorktree`. QRSPI skills stop instead of guessing when
the runtime is not installed in the current worktree, so commit the installed
files before creating managed worktrees.

To build without installing, run `bun run package`. This recreates the ignored
`dist/claude/` and `dist/codex/` trees.

### Verify installation

In either client, type `/qrspi-`. You should see the router and all seven
workflow phase skills. Verify `/setup-qrspi` as the separate configuration
utility.

## Usage

```bash
# Configure fixed managed-task paths before first use
/setup-qrspi

# Create a managed task and enter Question
/qrspi --new --task-id rate-limiting -- Add rate limiting to the API endpoints

# Resume exactly one phase
/qrspi --resume --task-id rate-limiting

# Question can also be invoked directly
/qrspi-question --task-id rate-limiting
```

These slash-form invocations are the same in Claude Code and Codex.
`/qrspi --new` creates the branch and managed worktree before entering Question.
The worktree starts at the current `HEAD` commit; staged, unstaged, and
untracked changes remain only in the originating worktree.
`/qrspi --resume` resolves the recorded task state and dispatches exactly one
phase; invoke it again in a fresh context after that phase is accepted. A direct
phase command may re-enter the current phase or an earlier phase, but the engine
rejects forward jumps.

`setup-qrspi` takes no arguments. It previews tracked `AGENTS.md` guidance and
the fixed ignore rules for `.qrspi/tasks/` and `.qrspi/worktrees/`, then writes
only after confirmation. Commit those files, along with the installed QRSPI
runtime and hooks, before creating a task so its managed worktree inherits the
same contract.

Start a fresh context window between workflow phases for best results.

### When to use QRSPI

Use it for complex, multi-file changes in existing codebases — the kind where
getting the design wrong is expensive. Every managed task follows all seven
phases; for smaller work, use the repository's ordinary development process.

## How It Works

### Artifact flow

All artifacts for a task live at the fixed repository-relative path
`.qrspi/tasks/current/` inside its managed worktree. Managed worktrees live at
`.qrspi/worktrees/<task-id>/` beneath the main worktree.

```
.qrspi/tasks/current/
├── task.json       # Authoritative task identity, phase, evidence, and worktree
├── task.md         # Verbatim task description; hidden from Research
├── references/     # Optional copied local references
├── questions.md    # Neutral research questions
├── research.md     # Factual findings with file:line references
├── design.md       # Approach, decisions, patterns to follow
├── structure.md    # Vertical slices with verification checkpoints
├── plan.md         # Tactical implementation details with checkboxes
└── pr.md           # Exact accepted HTTPS pull-request URL
```

The setup skill reconciles a `## QRSPI Configuration` section in `AGENTS.md`
and a labeled `.gitignore` block. QRSPI does not read or create
`.qrspi/config.json`; task and worktree locations are fixed protocol paths.

`task.json` is the state authority. The deterministic engine projects only the
absolute input and output paths allowed for the active phase, and each phase
reads only those paths. Research receives only `questions.md`; Design receives
`task.md`, copied references, `questions.md`, and `research.md`; Structure
receives `design.md` and `research.md`; Plan receives `structure.md`,
`design.md`, and `research.md`. This preserves isolation while retaining the
evidence required by each phase.

### Key design decisions

**Research is intentionally blind to the task.** Phase 1 writes neutral questions; Phase 2 answers them as a documentarian. If the researcher knows what you're building, findings become opinions. Separating "what to ask" from "what to find" produces objective facts.

**Design forces interaction before writing.** The Design phase works through a
task-sized decision tree in rounds. Each round asks the decisions whose
prerequisites are settled, presents meaningful options and a recommendation,
and waits for the user's answers. The agent confirms a thematic recap with the
user before writing `design.md`. This is structural, not optional — eliminating
the "magic words" problem where users had to know to ask for interaction.

**Vertical slices, not horizontal layers.** The Structure phase breaks work into end-to-end slices (migration + API + UI for one feature), not layers (all migrations, then all APIs, then all UI). Each slice is independently testable and verifiable.

**The task record is the workflow tracker.** Accepted phase evidence in
`task.json` controls routing. Implementation still checks and updates
`plan.md` checkboxes while executing each slice, but checkboxes do not choose
the workflow phase.

**One commit per implementation phase.** Each phase is committed separately after verification passes, making individual phases independently revertable.

### Going backward

Not every task flows linearly. Directly invoking the current phase is
idempotent. Invoking an earlier phase rewinds the task marker and clears that
phase's and later accepted evidence without deleting retained artifacts. The
engine rejects direct forward jumps. Each skill includes a "When to Go Back"
section:

- Research reveals bad questions — re-run Question
- Design finds missing research — re-run Question + Research
- Structure uncovers a flawed design — re-run Design
- Implementation hits a fundamental plan error — re-run Plan or Design

Small mismatches during implementation should be adapted in place. Fundamental
issues warrant going back. Once PR validation records the exact HTTPS URL in
`pr.md`, the marker advances to terminal `done`; `/qrspi --resume` reports that
state and dispatches no phase.

## Bundled agents

QRSPI skills reference the codebase agents by name. Their canonical Markdown
sources live in `src/agents/`. Packaging emits Claude Markdown definitions and
Codex TOML definitions with harness-specific model mappings:

| Agent | Purpose | Tools |
|-------|---------|-------|
| `codebase-locator` | Finds where files and components live (fast, no reading) | Grep, Glob, LS |
| `codebase-analyzer` | Traces how code works with `file:line` references | Read, Grep, Glob, LS |
| `codebase-pattern-finder` | Finds existing patterns with code examples | Grep, Glob, Read, LS |
| `web-search-researcher` | External docs (only when explicitly requested) | WebSearch, WebFetch, TodoWrite, Read, Grep, Glob, LS |

The three codebase agents operate as documentarians: they describe what exists without suggesting changes. The web researcher gathers and synthesizes external sources when explicitly requested.

## File structure

```text
src/
├── agents/
│   ├── codebase-analyzer.md
│   ├── codebase-locator.md
│   ├── codebase-pattern-finder.md
│   └── web-search-researcher.md
├── hooks/
│   └── qrspi-context.ts
├── tools/
│   ├── qrspi.ts
│   ├── protocol.ts
│   ├── task.ts
│   └── phase.ts
└── skills/
    ├── setup-qrspi/              # Configuration utility; not a workflow phase
    │   └── SKILL.md
    ├── qrspi/                    # Router; not a workflow phase
    │   ├── SKILL.md
    │   └── references/task-resume.md
    ├── qrspi-question/
    │   └── SKILL.md
    ├── qrspi-research/
    │   └── SKILL.md
    ├── qrspi-design/
    │   ├── SKILL.md
    │   └── references/design-discussion.md
    ├── qrspi-structure/
    │   └── SKILL.md
    ├── qrspi-plan/
    │   └── SKILL.md
    ├── qrspi-implement/
    │   └── SKILL.md
    └── qrspi-pr/
        └── SKILL.md
harness/
├── claude/
│   ├── agents.toml
│   └── settings.json
└── codex/
    ├── agents.toml
    └── hooks.json
scripts/
├── package.ts
└── install.ts
dist/                         # generated and gitignored
├── claude/.claude/{skills,agents,tools,hooks}/
└── codex/
    ├── .agents/skills/
    └── .codex/{agents,tools,hooks}/
```

## Contributing

Start with [`CONTRIBUTING.md`](CONTRIBUTING.md). It routes contributors to the
workflow contract, skill-authoring guidance, distribution packaging, testing
methodology, and architecture decision records (ADRs) relevant to their change.

[`AGENTS.md`](AGENTS.md) is intentionally a thin routing layer into the same
contributor documentation, not a separate handbook.

## References

- ["Everything We Got Wrong About Research-Plan-Implement"](https://www.youtube.com/watch?v=YwZR6tc7qYg) — Dexter Horthy, MLOps.community, March 2026
- [Advanced Context Engineering for Coding Agents](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents) — the original RPI methodology and prompts
- [12 Factor Agents](https://github.com/humanlayer/12-factor-agents) — the agent design principles underlying this approach

## License

MIT
