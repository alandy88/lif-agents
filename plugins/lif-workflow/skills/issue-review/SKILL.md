---
name: issue-review
description: "Use when reviewing the code changes on a branch for clarity, consistency, and maintainability without changing behavior — apply the repo's standards to the diff, run typecheck + tests, then commit only if something improved. Triggers: /issue-review, \"review this branch\", \"clean up the diff\", \"refine before merge\"."
argument-hint: "[issue-number]"
allowed-tools: Read, Glob, Grep, Edit, Write, Bash, Skill, TodoWrite
---

# issue-review

## Overview

Review the changes a branch makes against the default branch and bring them in
line with the repo's standards, without changing what the code does. This is
the interactive counterpart to the swarm-pi `review-prompt` template.

Behaviour stays identical because the implementer's tests define it. A
behaviour change hidden inside a cleanup commit is the hardest kind to bisect.

## Gather context

1. **Branch and base** — `git branch --show-current` against the default branch.
2. **The diff** — `git diff <base>...HEAD --stat`, then the full diff per file.
3. **Intent** — `gh issue view <N>` or the plan slice, when one is named.
4. **Standards** — the repo's `AGENTS.md` or `CLAUDE.md` (and any nested one
   covering the touched paths), lint and format config, and two or three
   neighbouring files for local idiom. The implementer worked without these,
   so applying them is this pass's main job.

## Review

Compare each changed hunk with the standards, then with these:

- Naming, structure, and error handling match the neighbouring code.
- No dead code, duplicated logic, or abstraction with a single caller.
- Comments explain why, never restate what the code does.
- Nesting and branching read top to bottom; nested ternaries become `if` or
  `switch`.
- Tests added by the branch follow the repo's test conventions.

Keep abstractions that make the code easier to debug or extend, even when
merging them would be shorter.

## Fix

1. Edit the branch directly for every finding that keeps behaviour identical.
2. Run the typecheck and test commands.
3. Commit as `refactor: <what was aligned>`. The `RALPH: Review -` prefix is for
   swarm runs only.

When the diff already meets the standards, change nothing and say so.

## Done when

Every hunk in the diff was checked against the standards, each finding is fixed
or listed, and the typecheck and tests exit 0.

## Report

Lead with what you changed. Then list every finding you did not fix, each with
a severity (`high`, `medium`, `low`) and the reason. Findings that need a
behaviour change, such as a bug or a missing case, belong here: report them, do
not fix them in this pass.
