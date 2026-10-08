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
>
> When you hit a gotcha or confirm a non-obvious fact, append one line to
> `<$RUN>/learnings.jsonl` right away: `{"role", "slice", "kind":
> "gotcha|learning|friction", "text", "evidence"}`. Evidence is a `file:line`,
> a command and its output, or a link. Skip notes you cannot back with evidence.

## Builder

```text
<goal>
Slice <n> of <total> for "<run title>": <what this slice achieves and why>.
</goal>

<scope>
Change: <files or modules>. Leave untouched: <files other slices own>.
</scope>

<context>
Worktree: <path>, branch shipit/<slug>-<n>, built on waves 1..<w-1>.
Other slices in this wave are being built at the same time in other worktrees.
Interfaces this slice consumes: <names, signatures, file:line>.
Interfaces it must expose for later waves: <names, signatures>.
Commands: <typecheck>, <test>.
Already decided: <decisions from plan.md that bear on this slice>.
</context>

<done_when>
<each Done-when command from plan.md, with expected result>
The slice's behaviour has tests. Work is committed on shipit/<slug>-<n>.
</done_when>

<report>
Lead with the Done-when results. Then the files changed and any interface you had
to shape differently from the brief, with the reason.
</report>
```

Get a working solution. The Reviewer applies the repo's full standards later,
so the Builder brief leaves them out.

A fix Builder uses the same brief with the finding, its evidence, and the previous
report added to `<context>`, and the finding's fix added to `<done_when>`.

## Reviewer

Paste the Fix ladder section of `SKILL.md` into `<fix_ladder>`.

```text
<goal>
Make slice <n> of "<run title>" right by reading it: it does what the slice
intends, honours its planned interfaces, and meets this repo's standards. The
Builder worked without the standards; applying them is part of your job. The
Tester runs and tests the integrated branch after you, so you own the code and
the Tester owns the tests.
</goal>

<context>
Worktree: <path>, branch shipit/<slug>-<n>. Review `git diff shipit/<slug>...HEAD`.
Slice intent: <goal line from plan.md>.
Interfaces it consumes and exposes: <from plan.md>.
Commands: <typecheck>, <lint>, <the slice's tests>.
</context>

<instructions>
1. Read every hunk and the code it calls. Check it against the slice intent: logic,
   edge cases, error paths, and the planned interfaces.
2. Apply the repo's standards as the `issue-review` skill gathers them: the repo's
   AGENTS.md or CLAUDE.md and any nested one for the touched paths, the lint config,
   and neighbouring files.
3. Fix each finding by the fix ladder. Keep existing tests passing; adjust one only
   when your fix changes what it asserts.
4. For every behaviour that needs a test, including each bug you fixed, write a
   test ask: the behaviour, the input, the expected result, and file:line.
</instructions>

<fix_ladder>
<Fix ladder section from SKILL.md>
</fix_ladder>

<done_when>
Every hunk was read against intent, interfaces, and standards. Each finding is
fixed or reported as large. The commands exit 0 and fixes are committed.
</done_when>

<report>
Lead with what you fixed, by ladder size. Then the test asks. Then every large
finding, each with a severity (high, medium, low), evidence, and the reason it is
large.
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
Worktree: <frozen worktree path>, detached at <sha>. Read-only: run git and
read files, change nothing.
Changeset: `git diff <default branch>...<sha>`.
Intent: <run goal from plan.md>.
Known weak spots, if any: <large findings and fixes from Reviewer reports>.
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

Paste the Fix ladder section of `SKILL.md` into `<fix_ladder>`.

```text
<goal>
Prove by running that the integrated branch for "<run title>" works, and leave it
with one lean test per real behaviour. The Reviewers already read and fixed each
slice against the repo's standards; your method is tests and runs, and the test
suite is yours.
</goal>

<context>
Worktree: <path>, on shipit/<slug>. Every slice is merged.
Run goal and slice Done-whens: <from plan.md>.
Test asks from the Reviewers: <list>.
A Breaker is reading a frozen copy of this branch at the same time. Its findings
go to a later Tester, so leave hunting for new failure modes to it.
Test commands: <unit>, <integration>, <e2e>, from <where they are defined>.
</context>

<instructions>
1. Write an acceptance test for the run goal and for each Done-when that no
   existing test pins.
2. Turn each test ask into a test.
3. Run every test suite. Fix what fails by the fix ladder.
4. Review the tests this branch added. Remove or merge tests that only restate
   the implementation, duplicate another test, or assert nothing a user would
   notice. Keep one test per real behaviour.
</instructions>

<fix_ladder>
<Fix ladder section from SKILL.md>
</fix_ladder>

<done_when>
Every test ask has a test or a recorded reason.
Every suite exits 0, is marked not run with a reason, or fails only on a reported
large finding.
</done_when>

<report>
Lead with pass/fail per suite. Then code fixes by ladder size, test asks skipped
with reasons, tests removed with reasons, and every large finding with severity,
evidence, and the failing test.
</report>
```

## Findings Tester

Paste the Fix ladder section of `SKILL.md` into `<fix_ladder>`.

```text
<goal>
Prove or disprove each Breaker finding on the integrated branch for "<run title>"
with a test, and fix the code where the test proves it. The first Tester already
built and pruned the branch's tests; add one test per confirmed finding.
</goal>

<context>
Worktree: <path>, on shipit/<slug>.
Breaker findings, high and medium: <path to $RUN/reports/breaker.json>. The
Breaker read the branch at <sha>; the first Tester may have changed code since.
First Tester's report: <path>.
Test commands: <unit>, <integration>, <e2e>.
</context>

<instructions>
1. For each finding, write the failing test it describes. If it fails, fix the
   code by the fix ladder until it passes. If it passes, the finding was wrong
   or is already fixed; record which, and remove the test.
2. Run every test suite. Fix what fails by the fix ladder.
</instructions>

<fix_ladder>
<Fix ladder section from SKILL.md>
</fix_ladder>

<done_when>
Every finding is fixed with a test, rejected with a reason, or reported as large.
Every suite exits 0, is marked not run with a reason, or fails only on a reported
large finding.
</done_when>

<report>
Lead with pass/fail per suite. Then findings fixed by ladder size, findings
rejected with reasons, and every large finding with severity, evidence, and the
failing test.
</report>
```

## Retro

```text
<goal>
Digest the learnings from the /shipit run "<run title>" into durable knowledge,
or drop them.
</goal>

<context>
Worktree: <integration worktree path>, on shipit/<slug>.
Learnings: <$RUN>/learnings.jsonl. Repo: <repo name>.
Vault: $LIF_NOTES_VAULT. Read it; do not edit it.
</context>

<instructions>
Follow the `retro` skill up to and including its proposal. Leave its After
approval section to the Orchestrator.
</instructions>

<done_when>
The `retro` skill's Done-when holds.
</done_when>

<report>
Lead with the counts the `retro` skill asks for. Then the path to retro.md.
</report>
```
