---
name: issue-review
description: "Use when reviewing the code changes on a branch for clarity, consistency, and maintainability without changing behavior — refine the diff, run typecheck + tests, then commit only if something improved. Triggers: /issue-review, \"review this branch\", \"clean up the diff\", \"refine before merge\"."
argument-hint: "[issue-number]"
allowed-tools: Read, Glob, Grep, Edit, Write, Bash, Skill, TodoWrite
---

# issue-review

## Overview

Review the changes a branch makes against the default branch and refine them for
clarity, consistency, and maintainability — **without changing what the code
does.** This is the interactive counterpart to the swarm-pi `review-prompt`
template: same review-and-refine loop, but you gather the branch/issue from
context and finish with a normal commit (or no commit, if the code is already
clean).

**Core rule: never change behavior. Only change how the code reads, not what it does.**

## When to use

- A feature branch is implemented and you want a clarity/maintainability pass
  before merge.
- The maintainer asks you to clean up or refine an existing diff.

When NOT to use: writing new functionality or fixing a bug (use
`issue-implement`), or a security/correctness audit (that is a different review).

## Gather context first

1. **Branch + base** — current branch (`git branch --show-current`) vs the
   default branch (usually `main`).
2. **The diff** — `git diff main..HEAD --stat` for the file list, then
   `git diff main..HEAD` (or per-file `git diff main..HEAD -- <path>`) for the
   changes you will review.
3. **The issue** — if the maintainer named one, `gh issue view <N>` for intent.

## Review process

Create a TodoWrite task per step:

1. **Understand the change** — read the diff and the issue intent.
2. **Analyze for improvements** — look for opportunities to:
   - Reduce unnecessary complexity and nesting.
   - Eliminate redundant code and abstractions.
   - Improve readability through clear variable and function names.
   - Consolidate related logic.
   - Remove comments that merely restate obvious code.
   - Replace nested ternaries with `switch` or `if`/`else` chains.
   - Choose clarity over brevity — explicit beats overly compact.
3. **Maintain balance** — avoid over-simplification that would:
   - Reduce clarity or maintainability.
   - Produce clever-but-opaque solutions.
   - Combine too many concerns into one function/component.
   - Remove helpful abstractions, or make the code harder to debug/extend.
4. **Preserve functionality** — never change outputs, features, or behavior.
   Only change how the code does it.

## Execution

If you find improvements:

1. Make the changes directly on this branch (Edit/Write).
2. Run the project's typecheck and test commands to confirm nothing broke.
   Follow superpowers:verification-before-completion — confirm passing output
   before committing.
3. Commit with a normal message describing the refinements (e.g.
   `refactor: simplify <area> for readability`). Do not use the swarm
   `RALPH: Review -` prefix — that is for AFK swarm runs only.

**If the code is already clean and well-structured, do nothing** and say so.

## Common mistakes

| Mistake | Fix |
|---|---|
| Changing behavior "while I'm here" | Refinement only — outputs and features must stay identical. |
| Refactoring for its own sake | If the code is already clean, make no changes. |
| Committing without re-running tests | Run typecheck + tests; a refactor that breaks tests is a regression. |
| Reviewing untracked scope | Review only the branch diff against the base, not the whole repo. |
