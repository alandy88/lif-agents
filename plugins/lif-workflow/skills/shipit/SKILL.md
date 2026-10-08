---
name: shipit
disable-model-invocation: true
description: "Take an idea to one merged pull request through Claude subagents: shape the idea, plan it into waves of coarse slices, build each wave's slices in parallel worktrees, review and fix each slice, attack and test the integrated branch, and shepherd one PR. Triggers: /shipit."
argument-hint: "[idea, issue number, or plan path]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill, TodoWrite
---

# shipit

You are the **Orchestrator**. You talk with the user, keep the plan, merge slices,
and dispatch every other role as a fresh Claude subagent. One `/shipit` run ends in
exactly one pull request, however many slices and worktrees it uses on the way.

```
Shape ─▶ Plan ─▶ Gate 1 ─▶ per wave: Build ∥ ─▶ Review ∥ ─▶ Merge ─▶ Check
                                                                      │
  PR ◀─ Gate 2 ◀─ Retro ◀─ Findings ◀─ Break ∥ Test ◀── last wave ◀──┘
```

## Roles

| Role | Runs as | Question it answers | Writes |
|---|---|---|---|
| Orchestrator | this session | what happens next | plan, merges, PR body |
| Architect | this session, `structured-planning` | what are the slices | `plan.md` |
| Builder | subagent per slice, own worktree | does it work | slice code and its tests |
| Reviewer | subagent per slice, Builder's worktree | is the code right, by reading | code fixes, test asks |
| Breaker | subagent, `model: opus`, read-only | how does it break | findings only |
| Tester | subagent, integration worktree | does the branch work, by running | tests, code fixes |
| Retro | subagent, integration worktree, `retro` skill | what did we learn | `AGENTS.md` only |

The Reviewer and the Tester split by method. The Reviewer **reads**: one slice,
before merge, against the slice's intent, its planned interfaces, and the repo's
standards. It fixes code and hands every behaviour that needs a test to the Tester
as a **test ask**. The Tester **runs**: the whole integrated branch, after the last
merge. It owns the test suite and fixes code its tests expose. Between the two,
style and standards are the Reviewer's and tests are the Tester's.

Builders skip the repo's full standards so their context goes to the problem;
the Reviewer applies them afterwards. Keep the Orchestrator's own context for
decisions: it reads subagent reports, not their diffs.

## Fix ladder

The Reviewer and the Tester fix what they find, sized by this ladder:

- **Small** — a local, obvious fix. Fix it in place; the Reviewer commits standards
  fixes as `refactor: <what was aligned>`.
- **Medium** — a real bug or gap inside the agent's own scope (the slice's files for
  the Reviewer, the branch for the Tester) that keeps every interface and decision in
  `plan.md`. Fix it, commit it on its own as `fix: <finding>`, and report it.
- **Large** — crosses a slice boundary, changes a planned interface or decision, or
  needs a redesign. Report it with a severity and leave the code as it is.

For each large finding, dispatch a fix Builder with the finding and the reporter's
evidence, into the slice worktree before merge or the integration worktree after, or bring it to the user when it changes a decision they approved.

## State

Keep run state outside the working tree so it never lands in the PR:

```bash
RUN="$(git rev-parse --git-common-dir)/shipit/<slug>"
```

`$RUN/plan.md` follows [assets/plan-template.md](assets/plan-template.md) and is the
single source of truth: waves, slices, their branches, status, and gate decisions.
Subagent briefs go to `$RUN/briefs/`, reports to `$RUN/reports/`. Every agent,
you included, appends gotchas and learnings to `$RUN/learnings.jsonl` in the
format the `retro` skill defines; the line goes in when the thing is found, not
saved for the report. Update `plan.md` after every dispatch returns, so a resumed
run (`/shipit <plan path>`) picks up from it.

The integration branch is `shipit/<slug>`, cut from the default branch and checked
out in its own worktree for the whole run:

```bash
git worktree add "../<repo>-shipit-<slug>" -b "shipit/<slug>" <default branch>
```

Create each slice's worktree yourself from the integration branch as it stands when
the slice's wave starts, so its base and branch are known:

```bash
git worktree add "../<repo>-shipit-<slug>-<n>" -b "shipit/<slug>-<n>" "shipit/<slug>"
```

Subagents work only inside the worktree path their brief names.

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

Run `structured-planning` for the design, then slice it into `$RUN/plan.md`.

A slice is a **coarse**, end-to-end piece of the feature: the chunk a lead would
hand one engineer for a day, usually several files with their tests. Size it as
large as one Builder can finish in one session with room to spare. Cut a new slice
only at a **seam** where one of these holds:

- the parts can be built side by side by different Builders, sharing no files;
- one part alone would crowd a Builder's session.

Keep a refactor and the behaviour it enables in the same slice, as separate commits.
Keep types, implementation, and tests of one behaviour in the same slice. A token,
option, or abstraction exists only if a current consumer reads it.

Group slices into **waves**. Slices in one wave share no files and depend on no
other slice in the wave; a wave may consume anything earlier waves expose. Prefer
**wide** plans over deep ones: few waves, many slices per wave. When a later wave
waits on one small interface, pin that interface's exact signature in the plan and
make it its own early slice, so the slices consuming it can run together after it.

Each slice:

- names the interfaces it consumes from earlier waves and exposes to later ones;
- ends on a checkable **Done when**, written by the rules in `plan-handoff`'s
  Verification gates section: commands that exit 0, a grep that returns nothing.

`structured-planning` ends on its own approval step. Fold it into Gate 1 by
showing the wave list in the same message.

## Gate 1 — plan approval

Show the user the waves: one line per slice with its Done-when, grouped by wave.
Wait for an explicit yes. Build nothing before it.

## 3. Build, Review, Merge, per wave

For each wave, in order:

1. Create every slice worktree in the wave, write each Builder brief from
   [references/briefs.md](references/briefs.md), and dispatch all of the wave's
   Builders at once: one message with one `Agent` call per slice, up to 6 per
   message. Record each worktree path and branch in `plan.md`.
2. Check each report against its slice's Done-when. A report is a claim: run the
   Done-when commands in each worktree yourself.
3. Dispatch the wave's Reviewers the same way, one per slice, all at once. Carry
   each Reviewer's test asks and large findings into `plan.md`.
4. Merge each reviewed slice into the integration worktree in plan order:
   `git -C <integration worktree> merge --no-ff shipit/<slug>-<n>`. On a conflict,
   run `git merge --abort` and dispatch a fresh subagent into the integration
   worktree with both slices' reports to resolve it.
5. Run the typecheck and unit command in the integration worktree. A failure here
   is a cross-slice break: treat it as a large finding.

A slice gets two retries in total. A retry is a fresh fix Builder in the slice's
worktree, given the failing output and the previous report; a fix the Reviewer
makes itself is not a retry. After the second failure, stop and bring the user the
slice, the failure, and your best guess at the cause. Other slices in the wave
carry on.

## 4. Break and Test, side by side

After the last wave merges, give the Breaker a frozen copy of the branch, so the
Tester's commits never move the code under it:

```bash
git worktree add --detach "../<repo>-shipit-<slug>-break" "shipit/<slug>"
```

Dispatch both at once, in one message with two `Agent` calls:

- the **Breaker** into the frozen worktree with its brief. It reads the whole diff
  cold and returns findings with severity and a reproduction; it changes nothing.
  Save the findings to `$RUN/reports/breaker.json`.
- the **Tester** into the integration worktree with its brief and every Reviewer
  test ask. It writes acceptance tests for the run's goal and each slice's
  Done-when, turns each test ask into a test, runs every suite the repo has, and
  prunes the run's tests to one per real behaviour.

Remove the frozen worktree once both return.

## 5. Findings

When the Breaker reports a `high` or `medium` finding, dispatch a fresh Tester
into the integration worktree with the Findings Tester brief, the Breaker findings, and
the first Tester's report. It turns each finding into a failing test, fixes the
code by the fix ladder until it passes, and runs every suite again. With no such
finding, skip this step.

Dispatch a fix Builder into the integration worktree for each large finding either
Tester reports, then re-run the full suite yourself before Retro.

## 6. Retro

Dispatch the Retro subagent into the integration worktree with its brief. It
runs the `retro` skill: commits repo `AGENTS.md` edits onto the integration
branch, so they ship in the same PR, and writes `$RUN/retro.md` with the vault
edits and issues it proposes. Re-run the full suite if it committed anything.

Then write the PR body to `$RUN/pr-body.md` from `pr-shepherd`'s template, using
`plan.md` and the reports. Write "not run" with a reason for any suite that did
not run.

## Gate 2 — PR approval

Show the user: wave and slice counts, test results per suite, Reviewer and Tester
fixes by ladder size, Breaker findings fixed and rejected with reasons, the PR title,
and the Retro proposal. Ask for each part separately: the PR, the vault edits,
committing and pushing the vault, and the issues. Wait for an explicit yes on each.

## 7. Ship

Apply what the user approved from `$RUN/retro.md` yourself, following the `retro`
skill's After approval section. Then run `pr-shepherd` on the integration branch
with `$RUN/pr-body.md`. It opens the one PR, triages review, watches CI, and asks
before merging. After merge, remove the worktrees and branches this run created.

## Done when

One PR from `shipit/<slug>` is merged with CI green on the default branch, every
slice in `plan.md` is marked merged, every large finding is fixed or declined by the
user, every Retro proposal is applied or declined, and no worktree from this run
remains.

## Report

Lead with the PR link and its state. Then any finding or follow-up the user still
has to decide on.
