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
branch from context instead of receiving them pre-filled, and you finish with a
normal commit rather than a swarm sentinel.

**Core rule: work on exactly one issue. Never expand scope mid-task.**

## When to use

- The maintainer points you at a specific issue ("fix #142", "do LIF-87").
- You are about to start coding against a tracked piece of work.

When NOT to use: multi-issue sweeps, exploratory spikes with no ticket, or
review/cleanup of an existing branch (use `issue-review` for that).

## Gather context first

Determine these from the conversation and the repo — ask only if genuinely
unresolved:

1. **Issue** — the number/identifier the maintainer named. Read it:
   `gh issue view <N> --comments` (works for GitHub repos). If it references a
   parent PRD or design doc, read that too.
2. **Branch** — the current branch (`git branch --show-current`). If you are on
   the main/default branch, create a feature branch before making changes; do
   not commit work to main.
3. **Project commands** — locate the repo's typecheck and test commands (look in
   `package.json`, `pyproject.toml`, `AGENTS.md`/`CONTEXT.md`, CI config).

If `gh` is not authenticated or the issue lives in another tracker, ask the
maintainer how to read it rather than guessing the requirements.

## Checklist

Create a TodoWrite task per step and complete in order:

1. **Read the issue** and confirm you understand the single, in-scope deliverable.
2. **Explore** the repo (Read/Grep/Glob/Bash) for the relevant code. Pay extra
   attention to test files that touch the affected area.
3. **Implement with red-green-refactor.** Follow superpowers:test-driven-development:
   write one failing test (RED), write the minimum implementation to pass it
   (GREEN), repeat until done, then refactor. Skip RGR only when the change is
   genuinely untestable (e.g. pure docs) — say so explicitly.
4. **Verify** — run the project's typecheck and test commands. Do not proceed
   until they pass. Follow superpowers:verification-before-completion.
5. **Commit** — a normal, conventional commit (see below).
6. **Report** — if the task is incomplete, leave a comment on the issue
   describing what was done. **Do not close the issue.**

## Commit message

Use the repo's normal commit style (Conventional Commits where the repo uses
them — e.g. `fix:`, `feat:`). The body should cover:

- What was completed + the issue/PRD reference (e.g. `Closes #142` / `Refs #142`).
- Key decisions made.
- Any blockers or follow-up notes.

Keep it concise. Do not use the swarm `RALPH:` prefix — that is for AFK swarm
runs only.

## Credentials

If `gh` is available, call it directly (`gh issue view`, `gh issue comment`).
Never prefix a `gh` command with the token or echo any credential in a shell
command — logs capture stdout and a leaked token is a real incident.

## Common mistakes

| Mistake | Fix |
|---|---|
| Fixing adjacent issues you noticed | Stay on the one issue. Note the rest for a separate ticket. |
| Committing to main | Branch first; never commit work straight to the default branch. |
| Claiming done without running tests | Run typecheck + tests and confirm output before committing. |
| Closing the issue | Leave it open; closing is handled later/by the maintainer. |
| Using `RALPH:` in the commit | That prefix is swarm-only; use the repo's normal style. |
