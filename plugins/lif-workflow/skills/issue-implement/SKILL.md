---
name: issue-implement
description: "Use when implementing or fixing a single GitHub issue on a feature branch interactively — explore the repo, drive the change with red-green-refactor, run typecheck + tests, then commit. Triggers: /issue-implement, \"implement issue #N\", \"fix issue #N\", \"work this ticket\"."
argument-hint: "[issue-number]"
allowed-tools: Read, Glob, Grep, Edit, Write, Bash, Skill, TodoWrite
---

# issue-implement

## Overview

Implement **one** GitHub issue, end to end, on a working branch. This is the
interactive counterpart to the swarm-pi `implement-prompt` template: same
explore → test → implement → verify → commit loop, but you gather the issue and
branch from context and finish with a normal commit.

Work on the one issue only. One issue per branch keeps the diff reviewable and
the commit revertable on its own.

## Gather context

Resolve these from the conversation and the repo. Ask only when two readings
would lead to materially different work.

1. **Issue** — `gh issue view <N> --comments`. If it references a parent PRD,
   design doc, or plan slice, read that too. If `gh` is not authenticated or the
   issue lives in another tracker, ask how to read it.
2. **Branch** — `git branch --show-current`. On the default branch, create a
   feature branch first, so `main` only changes through review.
3. **Project commands** — the repo's typecheck and test commands, from
   `package.json`, `pyproject.toml`, `AGENTS.md`, or CI config.

## Steps

1. **Explore** the code the issue touches, including the tests for that area.
2. **Implement red-green-refactor**: one failing test, the smallest code that
   passes it, repeat, then refactor. When the change has nothing testable (docs,
   config only), say so in the commit body.
3. **Verify** — run the typecheck and test commands.
4. **Commit** in the repo's style (Conventional Commits where the log uses
   them). The body names the issue (`Closes #142` or `Refs #142`), key
   decisions, and any follow-ups. The `RALPH:` prefix is for swarm runs only.
5. **Comment** on the issue when the work is incomplete, saying what was done.
   Leave the issue open; the maintainer closes it.

If you notice an adjacent bug or a better approach, say so in one sentence in
your report and keep to the issue as written.

## Done when

The issue's acceptance criteria are each met, the typecheck and test commands
exit 0, and the work is committed on a feature branch.

## Report

Lead with what changed and the test result, then any follow-up you noted.

## Credentials

Call `gh` directly. Never prefix a command with a token or echo a credential:
logs capture stdout, and a leaked token is a real incident.
