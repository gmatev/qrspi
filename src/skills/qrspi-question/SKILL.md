---
name: qrspi-question
description: Decompose a task into neutral research questions
argument-hint: "<ticket file, issue URL, or task description>"
disable-model-invocation: true
---

# Question — Decompose the Task

Transform a task description into 3-7 specific, neutral research questions. These questions drive the next phase (Research) which runs in a **separate context with no knowledge of what is being built**.

## Input

The user provides a task description, ticket file path, or issue reference.

## Process

1. **Resolve the tasks directory**: Read `.qrspi/config.json` from the repository
   root. Use its valid `tasks_directory` value, or `.qrspi/tasks` when the file
   or value is absent or invalid. Refer to the resolved value as
   `<tasks-directory>` for the rest of this skill. A valid value is relative to
   the repository and has slash-separated components containing only letters,
   digits, `.`, `_`, and `-`; it has no empty, `.` or `..` components.

2. **Read any provided files fully** before doing anything else.

3. **Light codebase exploration**: Spawn a **codebase-locator** agent to find which areas of the codebase relate to the task. You need to know what exists to write good questions.

4. **Decompose into 3-7 research questions**:
   - Each question should cause a researcher to explore a different relevant area of the codebase
   - Questions must be **neutral** — they ask what exists and how it works, never how to build something
   - Prefer "trace the flow" questions that reveal architecture over yes/no questions

   Good: "How does the middleware chain handle request authentication, and where are auth policies defined?"
   Bad: "What's the best way to add a new authenticated endpoint?"

   Good: "What patterns exist for database migrations, and how are they tested?"
   Bad: "How should we add a new migration for the users table?"

5. **Determine the artifact directory**:
   - With ticket number: `<tasks-directory>/PROJ-1234-brief-description/` (use the project's ticket prefix)
   - Without ticket: `<tasks-directory>/YYYY-MM-DD-brief-description/`

6. **Create the artifact directory** if it doesn't exist (for example,
   `mkdir -p <tasks-directory>/<id>/`).

7. **Write `task.md`** — a clean 2-3 sentence description of what's being built and why. This file persists the task context for later phases so the user doesn't have to re-explain it.

8. **Write `questions.md`** to the artifact directory:

   ```markdown
   # Research Questions

   ## Context
   [2-3 sentences describing which areas of the codebase to focus on.
   Do NOT mention what is being built or why.]

   ## Questions
   1. [Neutral, fact-seeking question]
   2. [Neutral, fact-seeking question]
   ...
   ```

9. **Present questions to the user** and wait for approval or edits before finalizing.

## Output

- Directory created: `<tasks-directory>/<id>/`
- Files written: `<tasks-directory>/<id>/task.md` and `<tasks-directory>/<id>/questions.md`
- Tell the user: "Next: run `/qrspi-research <tasks-directory>/<id>/`"

## Rules

- `questions.md` must NOT contain the task description, goals, or desired behavior
- `task.md` is a brief, honest description of the goal — it will be read by later phases but NOT by Research
- The researcher who reads these questions should have no idea what feature is being built
- Each question should target a different area or concern
- If the task is too simple for 3 questions, tell the user — QRSPI is for complex tasks
