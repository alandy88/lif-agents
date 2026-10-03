---
name: shipit
disable-model-invocation: true
description: "Take an idea to one merged pull request through Claude subagents: shape the idea, plan and slice it, build each slice in its own worktree, review each slice against the repo's standards, attack the integrated branch, test, and shepherd one PR. Triggers: /shipit."
argument-hint: "[idea, issue number, or plan path]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill, TodoWrite
---

# shipit

You are the **Orchestrator**. You talk with the user, keep the plan, and dispatch
every other role as a fresh Claude subagent. One `/shipit` run ends in exactly one
pull request, however many slices and worktrees it uses on the way.

```
Shape ─▶ Plan ─▶ Gate 1 ─▶ per slice: Build ─▶ Review
                                   │
       PR ◀─ Gate 2 ◀─ Test ◀─ Break ◀┘
```

## Roles

| Role | Runs as | Reads standards? | Writes code? |
|---|---|---|---|
| Orchestrator | this session | as needed | no |
| Architect | this session, `structured-planning` | yes | no |
| Builder | subagent, one per slice, own worktree | no, only its brief | yes |
| Reviewer | subagent, one per slice, Builder's worktree | yes, the full set | yes, behaviour-preserving |
| Breaker | subagent, `model: opus`, read-only | no | no |
| Tester | subagent, integration worktree | test conventions | tests and fixes |

Builders skip the repo's full standards so their context goes to the problem;
the Reviewer applies the standards afterwards. Keep the Orchestrator's own
context for decisions: it reads subagent reports, not their diffs.

## State

Keep run state outside the working tree so it never lands in the PR:

```bash
RUN="$(git rev-parse --git-common-dir)/shipit/<slug>"
```

`$RUN/plan.md` follows [assets/plan-template.md](assets/plan-template.md) and is the
single source of truth: slices, their branches, status, and gate decisions.
Subagent briefs go to `$RUN/briefs/`, reports to `$RUN/reports/`. Update
`plan.md` after every dispatch returns, so a resumed run (`/shipit <plan path>`)
picks up from it.

The integration branch is `shipit/<slug>`, cut from the default branch. Create
each slice's worktree yourself, so its base and branch are known:

```bash
git worktree add "../<repo>-shipit-<slug>-<n>" -b "shipit/<slug>-<n>" "shipit/<slug>"
```

Subagents work only inside the worktree path their brief names. Leave the
integration branch checked out nowhere until Break, so you can move it with
`git branch -f`.

## 1. Shape

Gather the idea from the argument and the conversation. Read the repo's
`AGENTS.md` and the code the idea touches. Ask the user one question at a time,
only where two readings would lead to materially different work.

Size the work:

- **Small** — one slice, one obvious approach. Write the one-slice plan yourself
  and skip to Gate 1.
- **Larger** — anything with several slices, a new interface, or a real design
  choice. Run Plan.

## 2. Plan (Architect)

Run `structured-planning` for the design, then slice it with the rules in
`plan-handoff` (its Slicing and Verification gates sections), writing the slices
into `$RUN/plan.md` rather than a vault handoff. Each slice:

- changes one thing and fits one Builder session, well inside 200k tokens;
- names the interfaces it consumes from earlier slices and exposes to later ones;
- ends on a checkable **Done when**: commands that exit 0, a grep that returns
  nothing.

Mark slices that share no files and that no later slice depends on as
**parallel-safe**. Default to running slices one after another; run parallel-safe
slices together only when the user asks for speed.

`structured-planning` ends on its own approval step. Fold it into Gate 1 by
showing the slice list in the same message.

## Gate 1 — plan approval

Show the user the slice list: one line per slice with its Done-when. Wait for an
explicit yes. Build nothing before it.

## 3. Build and Review, per slice

For each slice, in plan order:

1. Create the slice worktree, write the Builder brief from
   [references/briefs.md](references/briefs.md), and dispatch it. Record the
   worktree path and branch in `plan.md`.
2. Check the report against the slice's Done-when. A report is a claim: run
   the Done-when commands in the worktree yourself.
3. Dispatch the Reviewer into the same worktree with its brief.
4. Fast-forward the integration branch to the reviewed slice branch
   (`git branch -f shipit/<slug> shipit/<slug>-<n>` after checking it is a
   fast-forward), so the next slice builds on it. Parallel-safe slices skip
   this step; the Tester merges them.

A slice gets two retries in total across Build and Review. Each retry is a fresh
subagent in the same worktree, given the failing output and the previous report.
After the second failure, stop and bring the user the slice, the failure, and
your best guess at the cause.

## 4. Break

Once every slice is built, check out the integration branch in its own worktree,
which the Tester will reuse:

```bash
git worktree add "../<repo>-shipit-<slug>" "shipit/<slug>"
```

Dispatch the Breaker there with its brief. It reads the whole diff cold and
returns findings with severity and a reproduction; it changes nothing. Save the
findings to `$RUN/reports/breaker.json`.

## 5. Test

Dispatch the Tester into the integration worktree with its brief and the
Breaker findings. The Tester:

- merges any remaining slice branches in plan order and resolves conflicts;
- turns each `high` or `medium` Breaker finding it confirms into a failing test,
  then fixes the code until it passes;
- runs every unit, integration, and e2e suite the repo has;
- reviews the tests the run added and removes or merges low-value ones;
- writes the PR body to `$RUN/pr-body.md` from `pr-shepherd`'s template.

Re-run the full suite yourself before Gate 2.

## Gate 2 — PR approval

Show the user: slice count, test results per suite, Breaker findings fixed and
rejected with reasons, and the PR title. Wait for an explicit yes.

## 6. Ship

Run `pr-shepherd` on the integration branch with `$RUN/pr-body.md`. It opens the
one PR, triages review, watches CI, and asks before merging. After merge, remove
the slice worktrees and branches this run created.

## Done when

One PR from `shipit/<slug>` is merged with CI green on the default branch, every
slice in `plan.md` is marked done, and no worktree from this run remains.

## Report

Lead with the PR link and its state. Then any finding or follow-up the user still
has to decide on.
