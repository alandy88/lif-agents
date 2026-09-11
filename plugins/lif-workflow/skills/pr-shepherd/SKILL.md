---
name: pr-shepherd
description: "Use when opening a pull request on an alandy88 GitHub repo and driving it to merge — write the PR body, triage the Codex bot review, babysit CI to green, ask before merging, then watch post-merge main CI. Triggers: /pr-shepherd, \"open a PR\", \"raise a PR for this branch\", \"babysit the PR\", \"watch the checks\"."
argument-hint: "[pr-number|--draft]"
allowed-tools: Read, Glob, Grep, Edit, Write, Bash, TodoWrite
---

# pr-shepherd

## Overview

Own a pull request from open to merged-and-green. Five gates, in order; do not
skip forward.

1. **Open** — concise body: problem, solution, testing.
2. **Codex** — wait for `chatgpt-codex-connector`, triage every finding.
3. **CI** — watch checks until all green.
4. **Merge** — ask the user for permission. Never merge unprompted.
5. **Post-merge** — follow main-branch runs (deploys, release jobs) to green.

## Scope gate

This skill applies to repos owned by `alandy88`. Confirm before starting:

```bash
gh repo view --json nameWithOwner -q .nameWithOwner
```

If the owner is not `alandy88`, say so and stop — steps 2 and 5 assume this
account's Codex install and CI layout.

## 1. Open the PR

Read the actual diff before writing anything:

```bash
git log --oneline "$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)"..HEAD
git diff "$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)"...HEAD --stat
```

Push the branch, then open with the body from
[assets/pr-body-template.md](assets/pr-body-template.md). Pass the body via a
file, never inline quoting:

```bash
gh pr create --title "<type>(<scope>): <what changed>" --body-file <scratch>/pr-body.md
```

- Title under 70 chars, same conventional-commit style as the repo's log.
- Open with `--draft` when verification is still running or the user asked for
  a draft; mark ready with `gh pr ready <n>` once checks pass.
- Never invent testing claims. If a command was not run, write "not run" and
  say why.

## 2. Triage the Codex review

Codex posts within a few minutes of the push. Two possible outcomes:

**Clean** — a 👍 on the PR description:

```bash
gh api repos/<owner>/<repo>/issues/<n>/reactions \
  -q '[.[] | select(.user.login | startswith("chatgpt-codex-connector")) | .content]'
```

`+1` present means Codex found nothing. Move to gate 3.

**Findings** — a review plus inline comments:

```bash
gh pr view <n> --json reviews \
  -q '.reviews[] | select(.author.login=="chatgpt-codex-connector") | .body'
gh api repos/<owner>/<repo>/pulls/<n>/comments \
  -q '.[] | select(.user.login | startswith("chatgpt-codex-connector"))
       | "[\(.id)] \(.path):\(.line) \(.body)"'
```

Filter by author — the PR may carry human or other-bot threads that are not
yours to act on.

An `eyes` reaction and no review means Codex is mid-pass. Neither reaction nor
review means it has not started. Re-poll in both cases; never conclude "clean"
from silence.

Triage each finding per [references/codex-triage.md](references/codex-triage.md):
valid → fix; partially valid → fix the real part; wrong or out of scope →
reply on the thread with the reason. Push fixes as separate commits.

**Codex reviews once.** It fires on PR open, on draft → ready, and on an
explicit `@codex review` comment — pushing fix commits does *not* trigger a new
pass. Do not wait for one. Reply on the threads summarising the fixes, and
comment `@codex review` only if the fixes were substantial enough to want a
fresh opinion.

## 3. Babysit CI

```bash
gh pr checks <n> --watch --fail-fast
```

On failure, pull the log and fix the cause — never re-run hoping for green,
never disable the check:

```bash
gh run view <run-id> --log-failed
```

Flaky-looking failures still need a stated reason before a re-run. Loop back to
gate 2 if a fix invites a fresh Codex pass.

## 4. Ask to merge

Report to the user: Codex status, check summary, what changed since the PR
opened. Then ask. Wait for an explicit yes — merge is not implied by "looks
good" on an earlier step.

Use the repo's habitual strategy (check `gh pr list --state merged --limit 5`
or repo settings); default `--squash --delete-branch`.

## 5. Post-merge

Main-branch workflows fire on merge — deploys, state-apply jobs, releases.
Identify them by the merge commit, not by branch — `--branch main` returns
recent unrelated runs and lets you declare success on someone else's green:

```bash
SHA=$(gh pr view <n> --json mergeCommit -q .mergeCommit.oid)
gh run list --commit "$SHA" --json databaseId,name,status,conclusion
gh run watch <run-id> --exit-status
```

Runs queue a few seconds after the merge; an empty list means "not yet", so
re-poll before moving on. Watch every run for that SHA, not just the first.

Report each to green. A red post-merge run is an incident: surface it
immediately with the failing job and log excerpt, and propose a fix or revert.
The task is not done until main is green.
