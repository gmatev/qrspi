# QRSPI

**Question, Research, Structure, Plan, Implement** — an 8-phase workflow for Claude Code that breaks complex coding tasks into focused skills with clear artifacts between each step.

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
Question → Research → Design → Structure → Plan → Worktree → Implement → PR
```

| # | Phase | What it does | Output |
|---|-------|-------------|--------|
| 1 | **Question** | Decomposes the task into neutral research questions | `task.md` + `questions.md` |
| 2 | **Research** | Answers questions with facts only — never sees the task | `research.md` (~300 lines) |
| 3 | **Design** | Aligns on approach with the user — MUST ask questions first | `design.md` (~200 lines) |
| 4 | **Structure** | Breaks design into vertical slices with test checkpoints | `structure.md` (~2 pages) |
| 5 | **Plan** | Tactical implementation details for the agent | `plan.md` |
| 6 | **Worktree** | Creates isolated git worktree for implementation | git worktree |
| 7 | **Implement** | Executes plan phase-by-phase, commits after each | code changes |
| 8 | **PR** | Creates pull request grounded in the design document | GitHub PR |

The human reviews Design (~200 lines) and Structure (~2 pages) — not a 1000-line plan. By the time code is written, alignment has already happened.

## Install

### Quick install (copy into your project)

```bash
# From your project root
git clone https://github.com/gmatev/qrspi /tmp/qrspi

# Copy skills
mkdir -p .claude/skills
cp -R /tmp/qrspi/plugin/skills/qrspi-* .claude/skills/

# Copy bundled agents
mkdir -p .claude/agents
cp /tmp/qrspi/plugin/agents/*.md .claude/agents/

# Clean up
rm -rf /tmp/qrspi
```

### Manual install

1. Copy the `qrspi-*` directories from `plugin/skills/` into your project's `.claude/skills/`
2. Copy the Markdown files from `plugin/agents/` into your project's `.claude/agents/`
3. Both directories must exist at the root of your project

### Verify installation

Open Claude Code in your project and type `/qrspi-` — you should see all 8 skills in autocomplete.

## Usage

```bash
# Start with a task description, ticket file, or issue
/qrspi-question "Add rate limiting to the API endpoints"

# Continue through the remaining phases
/qrspi-research thoughts/qrspi/2026-03-29-rate-limiting/
/qrspi-design thoughts/qrspi/2026-03-29-rate-limiting/
/qrspi-structure thoughts/qrspi/2026-03-29-rate-limiting/
/qrspi-plan thoughts/qrspi/2026-03-29-rate-limiting/

# Optional: isolate work in a worktree
/qrspi-worktree thoughts/qrspi/2026-03-29-rate-limiting/

# Implement and ship
/qrspi-implement thoughts/qrspi/2026-03-29-rate-limiting/
/qrspi-pr thoughts/qrspi/2026-03-29-rate-limiting/
```

Start a fresh context window between phases for best results.

### When to use QRSPI

Use it for complex, multi-file changes in existing codebases — the kind where getting the design wrong is expensive. Not every task needs all 8 phases:

- **Simple bug fix**: Skip to `/qrspi-implement` with a hand-written plan
- **Small feature**: Start at `/qrspi-design` if you already know the codebase
- **Complex feature**: Run all 8 phases

If a task can be described in one sentence and touches fewer than 3 files, QRSPI is overkill.

## How It Works

### Artifact flow

All artifacts for a task live in one directory:

```
thoughts/qrspi/<task-id>/
├── task.md         # What we're building (hidden from Research to prevent bias)
├── questions.md    # Neutral research questions
├── research.md     # Factual findings with file:line references
├── design.md       # Approach, decisions, patterns to follow
├── structure.md    # Vertical slices with verification checkpoints
└── plan.md         # Tactical implementation details with checkboxes
```

Each phase reads only its specified inputs — not the full set. Research never sees `task.md`. Design reads `task.md`, `questions.md`, and `research.md`. Plan reads `structure.md`, `design.md`, and `research.md`. This prevents context pollution while keeping information available where it's needed.

### Key design decisions

**Research is intentionally blind to the task.** Phase 1 writes neutral questions; Phase 2 answers them as a documentarian. If the researcher knows what you're building, findings become opinions. Separating "what to ask" from "what to find" produces objective facts.

**Design forces interaction before writing.** The Design phase MUST present questions and wait for user input before producing the document. This is structural, not optional — eliminating the "magic words" problem where users had to know to ask for interaction.

**Vertical slices, not horizontal layers.** The Structure phase breaks work into end-to-end slices (migration + API + UI for one feature), not layers (all migrations, then all APIs, then all UI). Each slice is independently testable and verifiable.

**Checkboxes are the progress tracker.** Implementation updates `plan.md` checkboxes as phases complete. If a context window resets, the next session reads the checkboxes to know exactly where to resume.

**One commit per implementation phase.** Each phase is committed separately after verification passes, making individual phases independently revertable.

### Going backward

Not every task flows linearly. Each skill includes a "When to Go Back" section:

- Research reveals bad questions — re-run Question
- Design finds missing research — re-run Question + Research
- Structure uncovers a flawed design — re-run Design
- Implementation hits a fundamental plan error — re-run Plan or Design

Small mismatches during implementation should be adapted in place. Fundamental issues warrant going back.

## Bundled agents

QRSPI skills reference the codebase agents by name. The source files are bundled in `plugin/agents/` and copied to `.claude/agents/` during project installation:

| Agent | Purpose | Tools |
|-------|---------|-------|
| `codebase-locator` | Finds where files and components live (fast, no reading) | Grep, Glob, LS |
| `codebase-analyzer` | Traces how code works with `file:line` references | Read, Grep, Glob, LS |
| `codebase-pattern-finder` | Finds existing patterns with code examples | Grep, Glob, Read, LS |
| `web-search-researcher` | External docs (only when explicitly requested) | WebSearch, WebFetch, TodoWrite, Read, Grep, Glob, LS |

The three codebase agents operate as documentarians: they describe what exists without suggesting changes. The web researcher gathers and synthesizes external sources when explicitly requested.

## File structure

```
.claude-plugin/
└── marketplace.json
plugin/
├── .claude-plugin/
│   └── plugin.json
├── .codex-plugin/
│   └── plugin.json
├── agents/
│   ├── codebase-analyzer.md
│   ├── codebase-locator.md
│   ├── codebase-pattern-finder.md
│   └── web-search-researcher.md
└── skills/
    ├── qrspi-question/
    │   ├── SKILL.md
    │   └── agents/openai.yaml
    ├── qrspi-research/
    │   ├── SKILL.md
    │   └── agents/openai.yaml
    ├── qrspi-design/
    │   ├── SKILL.md
    │   └── agents/openai.yaml
    ├── qrspi-structure/
    │   ├── SKILL.md
    │   └── agents/openai.yaml
    ├── qrspi-plan/
    │   ├── SKILL.md
    │   └── agents/openai.yaml
    ├── qrspi-worktree/
    │   ├── SKILL.md
    │   └── agents/openai.yaml
    ├── qrspi-implement/
    │   ├── SKILL.md
    │   └── agents/openai.yaml
    └── qrspi-pr/
        ├── SKILL.md
        └── agents/openai.yaml
```

## References

- ["Everything We Got Wrong About Research-Plan-Implement"](https://www.youtube.com/watch?v=YwZR6tc7qYg) — Dexter Horthy, MLOps.community, March 2026
- [Advanced Context Engineering for Coding Agents](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents) — the original RPI methodology and prompts
- [12 Factor Agents](https://github.com/humanlayer/12-factor-agents) — the agent design principles underlying this approach

## License

MIT
