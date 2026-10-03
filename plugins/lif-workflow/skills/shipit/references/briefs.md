# Subagent briefs

Each subagent starts with no context. Its brief is everything it knows, so fill
every `<placeholder>` from `plan.md` and the repo, and write it to
`$RUN/briefs/<role>-<n>.md` before dispatch. The sections follow the brief rules
in `prompt-optimize` (`references/rewrite-rules.md`): state the goal and its
reason, use calm wording, and end on a checkable Done-when. The Orchestrator
checks the work, so no brief asks a subagent to double-check itself.

Every brief ends with:

> Work only inside `<worktree path>`. Make routine judgment calls yourself. If the
> brief seems wrong or a better approach exists, say so in one sentence in your
> report and continue as briefed. Keep working until Done-when holds.

## Builder

```text
<goal>
Slice <n> of <total> for "<run title>": <what this slice achieves and why>.
</goal>

<scope>
Change: <files or modules>. Leave untouched: <files other slices own>.
</scope>

<context>
Worktree: <path>, branch shipit/<slug>-<n>, built on slices 1..<n-1>.
Interfaces this slice consumes: <names, signatures, file:line>.
Interfaces it must expose for later slices: <names, signatures>.
Commands: <typecheck>, <test>.
Already decided: <decisions from plan.md that bear on this slice>.
</context>

<done_when>
<each Done-when command from plan.md, with expected result>
Work is committed on shipit/<slug>-<n>.
</done_when>

<report>
Lead with the Done-when results. Then the files changed and any interface you had
to shape differently from the brief, with the reason.
</report>
```

Get a working solution. The Reviewer applies the repo's full standards later,
so the Builder brief leaves them out.

## Reviewer

```text
<goal>
Bring slice <n> of "<run title>" in line with this repo's standards without
changing its behaviour. The Builder worked without the standards; applying them
is your job.
</goal>

<context>
Worktree: <path>, branch shipit/<slug>-<n>. Review `git diff shipit/<slug>...HEAD`.
Slice intent: <goal line from plan.md>.
Commands: <typecheck>, <test>, <lint>.
</context>

<instructions>
Follow the `issue-review` skill: read the repo's AGENTS.md or CLAUDE.md and any
nested one for the touched paths, the lint config, and neighbouring files, then
fix every behaviour-preserving finding and commit.
</instructions>

<done_when>
Every hunk was checked against the standards, the commands exit 0, and fixes are
committed.
</done_when>

<report>
Lead with what you changed. Then every finding you left unfixed, each with a
severity (high, medium, low) and the reason. Bugs and missing cases go here,
not into the code.
</report>
```

## Breaker

Dispatch with `model: "opus"`.

```text
<goal>
Find the ways the change for "<run title>" breaks. It is about to become a pull
request; anything you find now is cheaper than a bug in production.
</goal>

<context>
Worktree: <integration worktree path>, on shipit/<slug>. Read-only: run git and
read files, change nothing.
Changeset: `git diff <default branch>...shipit/<slug>`.
Intent: <run goal from plan.md>.
Known weak spots, if any: <from Reviewer reports>.
</context>

<instructions>
Read every touched file in full and the code that calls it. Look for wrong
results, unhandled inputs, races, leaks, broken contracts between slices, and
tests that pass without proving the behaviour.
</instructions>

<done_when>
Every touched file was read, and each finding has a reproduction.
</done_when>

<report>
Return JSON only: a list of findings, each with severity (high, medium, low),
file, line, what breaks, and a reproduction: the input or test that shows it.
Report every finding; the Orchestrator filters by severity afterwards.
</report>
```

## Tester

```text
<goal>
Turn the integration branch for "<run title>" into one tested, PR-ready branch.
</goal>

<context>
Worktree: <path>, on shipit/<slug>.
Slice branches still to merge, in order: <list, or "none">.
Breaker findings: <path to $RUN/reports/breaker.json>.
Test commands: <unit>, <integration>, <e2e>, from <where they are defined>.
PR body template: the `pr-shepherd` skill's assets/pr-body-template.md.
</context>

<instructions>
1. Merge the listed slice branches in order and resolve conflicts.
2. For each high or medium Breaker finding, write the failing test it describes.
   If it fails, fix the code until it passes. If it passes, the finding was
   wrong; record why.
3. Run every test suite.
4. Review the tests this branch added. Remove or merge tests that only restate
   the implementation, duplicate another test, or assert nothing a user would
   notice. Keep one test per real behaviour.
5. Write the PR body to <$RUN/pr-body.md>. Write "not run" with a reason for any
   suite you could not run.
</instructions>

<done_when>
All slices merged, every suite exits 0 or is marked not run with a reason, every
high and medium finding is fixed or rejected with a reason, and the PR body exists.
</done_when>

<report>
Lead with pass/fail per suite. Then findings fixed, findings rejected with
reasons, and tests removed with reasons.
</report>
```
