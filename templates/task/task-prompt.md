# TASK

You are delivering exactly ONE task from `PLAN.md` on branch `{{BRANCH}}`.

**Task to execute:** {{TASK_LABEL}}

If that differs from the "Next task" recommendation in `STATE.md`, the task named above wins.

# CONTEXT

Read, in this order, before taking any action:

- `AGENTS.md` at the repo root — the project's structure, conventions, and rules.
- `PLAN.md` — the task's scope, and what the surrounding tasks own instead.
- The top entry of `STATE.md` — where the previous session left off.

Explore only what the CURRENT task touches. The plan exists so each session stays small.

# ENVIRONMENT

The sandbox has already been warmed up — dependencies are installed and any generated
files are refreshed. Do not repeat that setup.

# FEEDBACK LOOPS

`{{VERIFY}}` is your feedback loop and must be green before you finish. Alongside it,
run the checks relevant to what you touched:

{{CONVENTIONS}}

# FINAL RULES

- ONLY work on the current task. Out-of-scope discoveries go in your final message, not into the diff.
- Definition of done: `{{VERIFY}}` green, `STATE.md` has a new top entry ending with a
  `Next task: **<label>**` recommendation, and everything is committed.
- Do NOT push, open a PR, or merge — the orchestrator does that after verification.

Once the task's definition of done is fully met, output `<promise>COMPLETE</promise>` on its own line.
