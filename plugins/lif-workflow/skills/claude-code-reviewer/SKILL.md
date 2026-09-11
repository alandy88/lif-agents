---
name: claude-code-reviewer
disable-model-invocation: true
description: "Use when the user wants to run Claude Code CLI in one-shot (`claude -p`) review mode for code, architecture, or spec feedback."
argument-hint: "[review-scope or target]"
allowed-tools: Bash(claude *)
---

# Claude Code Reviewer

## Overview

Use Claude Code as a reviewer, not an editor. Prefer reproducible one-shot `claude -p` commands that ask for findings, risks, missing tests, assumptions, and tradeoffs.

## Quick Start

1. Run Claude from the repo root or the smallest directory that contains the review target.
2. Start with `claude -p` and put the target plus expected output shape in the prompt.
3. Default to `--permission-mode plan` for review-only work.
4. Use `--model sonnet` for most code and feature reviews.
5. Use `--model opus` when the task needs deeper architecture or design synthesis.
6. Prefer `--append-system-prompt` or `--append-system-prompt-file` over replacing the full system prompt.

## Core Commands

```bash
# First-pass review
claude -p "Review the current diff. List findings by severity, then open questions, then recommended next steps."

# Most review-safe default
claude -p --permission-mode plan --model sonnet "Review this repo area for correctness risks, regressions, and missing tests."

# Continue the most recent review in this directory
claude -c -p "Now focus only on test gaps and edge cases."

# Resume a named or ID-based session
claude -r "auth-refactor" "Re-evaluate the architecture tradeoffs after these changes."
```

## Review Patterns

### Code Review

Use when the target is a diff, PR, file set, or implementation that may contain correctness bugs or regressions.

```bash
claude -p --permission-mode plan --model sonnet \
  --append-system-prompt "Prioritize correctness, regressions, security, and missing tests. Findings first." \
  "Review the current diff. Cite the risky files and explain what could break."
```

### Feature Review

Use when the user wants feedback on whether a feature meets its goal, is complete, and fits existing behavior.

```bash
claude -p --permission-mode plan --model sonnet \
  "Review the search feature implementation. Identify incomplete behavior, UX or API mismatches, and missing validation."
```

### Architecture Review

Use when the user wants system-level critique, tradeoffs, failure modes, boundary clarity, or maintainability analysis.

```bash
claude -p --permission-mode plan --model opus \
  --append-system-prompt "Analyze architecture tradeoffs, failure modes, coupling, operational risk, and migration cost." \
  "Review the current auth/session architecture and recommend the highest-leverage simplifications."
```

### Design Or Spec Review

Use when the target is a proposal, plan, or intended behavior rather than finished code.

```bash
claude -p --permission-mode plan --model opus \
  "Review this design doc. Identify ambiguous requirements, hidden assumptions, risky sequencing, and missing test strategy."
```

## Prompt Checklist

Good review prompts usually specify all of the following:

- Review target: current diff, named files, feature area, or design topic
- Review lens: correctness, regression risk, architecture, testing, security, maintainability
- Output shape: findings first, then open questions, then recommendations
- Constraints: coding standards, compatibility requirements, performance limits, release risk
- Evidence expectation: cite files, functions, failure modes, or concrete scenarios

## Useful Flags

### `--model`

Use an alias such as `sonnet` or `opus`, or a full model name. Prefer:

- `sonnet` for most code and feature reviews
- `opus` for architecture, design, and higher-ambiguity critique

### `--permission-mode`

Begin review sessions with `plan` unless the task genuinely requires edits. This keeps Claude Code in a review-oriented posture.

```bash
claude -p --permission-mode plan "Review the migration plan for hidden risks."
```

### `--allowedTools`

Use this when you want certain read-oriented actions to execute without extra permission prompts. The CLI docs show permission-rule syntax such as:

```bash
claude -p --permission-mode plan \
  --allowedTools "Bash(git log *)" "Bash(git diff *)" "Read" \
  "Review recent changes for regression risk."
```

If you need a hard ceiling on which tools are available, use `--tools` instead.

### `--append-system-prompt`

Use this to add your house review rubric without removing Claude Code's defaults.

```bash
claude -p --append-system-prompt \
  "Prioritize correctness, regressions, missing tests, and maintainability tradeoffs." \
  "Review the selected files."
```

### `--append-system-prompt-file`

Use this for version-controlled review standards.

```bash
claude -p --append-system-prompt-file ./prompts/review-rubric.txt \
  "Review the current design proposal."
```

### `--output-format`

Use print mode output formats deliberately:

- default text output for human review
- `json` when another tool will consume the result
- `stream-json` for streaming integrations

```bash
claude -p --output-format json \
  "Return JSON with keys findings, questions, recommendations for the current diff review."
```

### `--verbose`

Use only when you need full turn-by-turn output for debugging or prompt iteration.

### `--worktree`

Use when you want Claude to inspect an isolated git worktree for a risky branch or parallel review context.

```bash
claude -w feature-auth -p --permission-mode plan \
  "Review this worktree for migration and release risk."
```

## Session Follow-Ups

- Use `claude -c -p "..."` to continue the most recent review in the current directory.
- Use `claude -r "<session>" "..."` to revisit a named or ID-based session.
- Prefer a new one-shot command instead of continuation when the review target or rubric changes substantially.

## Common Mistakes

- Asking for a generic review with no target, rubric, or output shape
- Using edit-oriented permissions for a review-only task
- Replacing the full system prompt when an appended rubric would do
- Requesting JSON output without telling Claude which keys or schema to return
- Treating architecture review like code review; architecture prompts need tradeoffs and failure modes

## Source Notes

Base command and flag guidance on Anthropic's official Claude Code documentation:

- CLI reference: `https://docs.anthropic.com/en/docs/claude-code/cli-reference`
- Model configuration: `https://docs.anthropic.com/en/docs/claude-code/model-config`
