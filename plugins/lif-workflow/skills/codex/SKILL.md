---
name: codex
description: "Use when fanning out work to Codex CLI — hand a plan to Codex for implementation, or hand a finished change to Codex for independent review. Triggers: /codex, \"fanout to codex\", \"have codex implement this\", \"have codex review this\"."
argument-hint: "[implement <plan-file>|review <range|pr>]"
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, TodoWrite
---

# codex

## Overview

Fan work out to a Codex CLI session. Two modes:

- **implement** — a plan exists (plan-mode output, a plan file, or the current
  discussion); Codex writes the code in `--sandbox workspace-write`.
- **review** — a change exists (working diff, branch, or PR); Codex critiques
  it in `--sandbox read-only` and returns structured findings.

The value of this skill is the **handoff doc**: you have the conversation
context, Codex does not. A thin handoff produces a bad fanout.

## Shared mechanics (both modes)

1. Write the handoff as a markdown file in the session scratchpad directory
   (never inline the prompt in the shell command — quoting breaks on Windows).
2. Feed it via stdin with `-`, capture the final answer with
   `--output-last-message`.
3. Run long invocations in the background (`run_in_background`); implement
   runs can take 10–30 minutes. Report to the user that Codex is running,
   then verify when it completes.
4. Iterate with `codex exec resume --last "<feedback>"` — never start a fresh
   session for a follow-up round; the resumed session keeps full context.

Model selection (override only if the user asks):

| Task | Model | Effort |
|---|---|---|
| implement, code review | `gpt-5.3-codex` | high |
| plan / design / spec review | `gpt-5.4` | high |

## Mode: implement

1. **Materialize the plan** into a handoff doc — use
   [references/handoff-implement.md](references/handoff-implement.md) as the
   template. Acceptance criteria must be runnable commands (tests, typecheck),
   not prose. If there is no plan yet, stop and say so — this skill fans out
   existing plans; it does not invent them.
2. **Isolate by default**: create a worktree and point Codex at it.
   ```bash
   git worktree add "../<repo>-codex-<slug>" -b "codex/<slug>"
   ```
   Skip only if the user explicitly asks for in-place (`--in-place`).
3. **Run** (background):
   ```bash
   codex exec -C "<worktree>" --sandbox workspace-write --full-auto \
     -m gpt-5.3-codex -c model_reasoning_effort="high" \
     --skip-git-repo-check \
     --output-last-message "<scratchpad>/codex-out.md" \
     - < "<scratchpad>/handoff.md"
   ```
4. **Verify on completion** — do not relay Codex's self-report as fact:
   - Read `codex-out.md`.
   - `git -C <worktree> diff --stat` (confirm it touched what the plan said).
   - Run every acceptance command from the handoff doc; report pass/fail
     honestly.
5. **Iterate** on failures via `codex exec resume --last` with the specific
   failure output. After two failed rounds, stop and surface the state to the
   user instead of looping.
6. When accepted, tell the user the worktree/branch name — merging is their
   call. Do not merge or clean up the worktree unasked.

## Mode: review

1. **Resolve the changeset**: working diff (`HEAD`), branch range
   (`master..HEAD`), or PR (`gh pr diff <n>` to confirm it exists, then pass
   the range). Give Codex the **range**, not the inlined diff — it is inside
   the repo read-only and explores surrounding context itself.
2. **Write the handoff** — use
   [references/handoff-review.md](references/handoff-review.md). The critical
   section is *intent*: what was built and why, which only you know.
3. **Run** (background if the diff is large):
   ```bash
   codex exec -C "<repo>" --sandbox read-only --full-auto \
     -m gpt-5.3-codex -c model_reasoning_effort="high" \
     --skip-git-repo-check \
     --output-schema "<skill-dir>/references/findings-schema.json" \
     --output-last-message "<scratchpad>/codex-findings.json" \
     - < "<scratchpad>/handoff.md"
   ```
   Use `gpt-5.4` instead when reviewing a plan/design/spec document rather
   than code.
4. **Triage before presenting**: read each finding and check it against the
   actual code. Mark each one confirmed / dubious / wrong. Present confirmed
   findings first with file:line references; note the rejected ones in a
   single line. Never relay the raw findings unverified.
5. If the user wants fixes applied, either fix here in Claude Code (small) or
   fan back out with `codex exec resume --last` listing the confirmed
   findings (large).

## Common mistakes

| Mistake | Fix |
|---|---|
| Inlining the prompt in the shell command | Always write a handoff file, feed via `- <` stdin. |
| Thin handoff ("implement the plan we discussed") | Codex has no conversation context — the handoff doc must stand alone. |
| Trusting Codex's completion report | Run the acceptance commands yourself before reporting done. |
| Fresh session for round 2 | `codex exec resume --last` keeps the session's context. |
| Relaying review findings unverified | Triage against the code first; external review has false positives. |
| Letting Codex write in the shared working tree | Worktree by default; in-place only on explicit request. |
