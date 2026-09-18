# Design interview

Interview the user relentlessly until you reach a shared understanding.
Map this as a **design tree**: every decision branches into the decisions
that hang off it. The exhaustiveness of the **design tree** must be
commensurate with the scope of the task. Do not overcomplicate things.

Work the tree in **rounds**. The **frontier** is every decision whose
prerequisites are already settled: the questions you can ask _now_ without
guessing at answers you haven't heard yet. Ask the whole frontier in one
round: number each question and give your recommended answer. Then wait for
the user's answers before the next round.

Format a round as follows, providing 2 or 3 meaningful options.
NEVER invent options just to pad the list.

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs>

- **A. <short label>** - <what this option means, its tradeoff>
- **B. <short label>** - <what this option means, its tradeoff>
- **C. <short label>** - <what this option means, its tradeoff>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs>

- **A. <short label>** - <what this option means, its tradeoff>
- **B. <short label>** - <what this option means, its tradeoff>

➡️ <your recommended answer>
```

Every choice gets its **own line** as a lettered bullet, never a run-on sentence
of alternatives buried in the question body. The user answers by letter, so the
letters have to be scannable.

The **title names the decision; the body poses it**. Never ship a question as a
bare title: `Q1 - Read scope` shows the user a topic and asks them nothing,
and where the question came from a written requirement, the body is that
requirement's own wording rather than a two-word summary of it. A user who has
to reconstruct the question from its title is answering a question you never
asked.

Each round the user answers reshapes the tree: settled decisions push the
frontier outward and unblock questions that depended on them. Recompute the
frontier and ask the next round. A question whose answer depends on another
question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a
fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to
find it; don't ask the user for anything you could look up yourself. Don't
block on it: a running exploration is an unsettled prerequisite, so only the
questions downstream of it wait for the sub-agent to report; ask the rest of
the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree
has been visited, with nothing left silently assumed. Close with a recap of the
design discussion and decisions organized thematically, then ask the user to
confirm that you have reached a shared understanding and the summary looks good.

Do not act until they confirm. Only _after_ they confirm, continue to create
`design.md` as a separate step.
