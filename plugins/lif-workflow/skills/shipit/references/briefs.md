# Subagent briefs

Each subagent starts with no context. Its brief is everything it knows about the
slice, so fill every `<placeholder>` from `plan.md` and the repo, and write it to
`$RUN/briefs/<role>-<n>.md` before dispatch. The standing rules for the Builder,
Reviewer, Breaker and Tester (method, fix ladder, report format, learnings line) live
in their agent files under `agents/`, so a brief carries only what changes per
dispatch. Every `<context>` names the worktree and `Learnings: <$RUN>/learnings.jsonl`,
because the agent's footer points there. The sections follow the brief rules in
`prompt-optimize` (`references/rewrite-rules.md`): state the goal and its reason, use
calm wording, and end on a checkable Done-when. The Orchestrator checks the work, so
no brief asks a subagent to double-check itself.

Dispatch each role by its agent type, and pass no `model`: the agent file sets it.

## Builder

Agent type `lif-workflow:builder`. A fix Builder uses the same type and brief with the
finding, its evidence, and the previous report added to `<context>`, and the finding's
fix added to `<done_when>`.

```text
<goal>
Slice <n> of <total> for "<run title>": <what this slice achieves and why>.
</goal>

<scope>
Change: <files or modules>. Leave untouched: <files other slices own>.
</scope>

<context>
Worktree: <path>, branch shipit/<slug>-<n>, built on waves 1..<w-1>.
Learnings: <$RUN>/learnings.jsonl.
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
```

## Reviewer

Agent type `lif-workflow:reviewer`.

```text
<goal>
Review slice <n> of "<run title>".
</goal>

<context>
Worktree: <path>, branch shipit/<slug>-<n>. Review `git diff shipit/<slug>...HEAD`.
Learnings: <$RUN>/learnings.jsonl.
Slice intent: <goal line from plan.md>.
Interfaces it consumes and exposes: <from plan.md>.
Commands: <typecheck>, <lint>, <the slice's tests>.
</context>
```

## Breaker

Agent type `lif-workflow:breaker`.

```text
<goal>
Find the ways the change for "<run title>" breaks.
</goal>

<context>
Worktree: <frozen worktree path>, detached at <sha>.
Learnings: <$RUN>/learnings.jsonl.
Changeset: `git diff <default branch>...<sha>`.
Intent: <run goal from plan.md>.
Known weak spots, if any: <large findings and fixes from Reviewer reports>.
</context>
```

## Tester

Agent type `lif-workflow:tester`. Say "Integration pass" in `<goal>`.

```text
<goal>
Integration pass for "<run title>".
</goal>

<context>
Worktree: <path>, on shipit/<slug>. Every slice is merged.
Learnings: <$RUN>/learnings.jsonl.
Run goal and slice Done-whens: <from plan.md>.
Test asks from the Reviewers: <list>.
Test commands: <unit>, <integration>, <e2e>, from <where they are defined>.
</context>
```

## Findings Tester

Agent type `lif-workflow:tester`. Say "Findings pass" in `<goal>`.

```text
<goal>
Findings pass for "<run title>".
</goal>

<context>
Worktree: <path>, on shipit/<slug>.
Learnings: <$RUN>/learnings.jsonl.
Breaker findings, high and medium: <path to $RUN/reports/breaker.json>. The
Breaker read the branch at <sha>.
First Tester's report: <path>.
Test commands: <unit>, <integration>, <e2e>.
</context>
```

## Retro

Dispatch with `model: "sonnet"`; Retro has no agent file because the `retro` skill
already holds its rules.

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
approval section to the Orchestrator. Work only inside the worktree.
</instructions>

<done_when>
The `retro` skill's Done-when holds.
</done_when>

<report>
Lead with the counts the `retro` skill asks for. Then the path to retro.md.
</report>
```
