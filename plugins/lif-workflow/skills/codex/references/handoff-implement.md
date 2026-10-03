# Implementation Handoff

You are implementing a pre-approved plan in this repository. Nobody is watching
this run, so the plan below is the whole conversation you get.

## Goal

<!-- One or two sentences: what this change achieves and why. The reason lets
     Codex handle cases the plan does not list. -->

## Scope

<!-- What to change, what to leave alone. Name files or modules that must stay
     untouched. -->

## Context

<!-- Exact paths, commands, prior decisions, and what was already tried or ruled
     out. Skip anything one `ls` or file read would show. -->

## Constraints

<!-- Each rule with its reason, phrased as the behaviour you want.
     "Keep the public signature of `parse()` — three repos import it" beats
     "DO NOT change parse()". -->

## Plan

<!-- The step-by-step plan, verbatim from the plan file. -->

## Done when

<!-- Runnable commands only, one per line, with expected outcome.
     e.g.  bun test — all pass
           bun run typecheck — no errors -->

## Report

Lead with whether every Done-when command passed, then what changed per file,
then anything you could not finish and why.

## How to work

Deliver what was asked, at the scope intended. If you notice an adjacent bug or a
better approach, say so in one sentence in the report and continue with the plan
as written.

Keep working until the Done-when line holds. A message with no tool call ends the
run, so put status notes in the same message as your next tool call. Stop only
when nothing can move without the user.
