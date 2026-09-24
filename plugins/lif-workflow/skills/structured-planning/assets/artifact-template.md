# <Topic>

> Scope: <trivial|moderate|complex>
> Date: YYYY-MM-DD
> Status: draft | approved | superseded

## Goal

One sentence. What this artifact decides or specifies.

## Context

Where this fits. What exists today that matters. Use `[evidence: path:line]` freely.

## Non-goals

What this explicitly does NOT cover. Kills scope creep in reviews.

## Alternatives considered

_(moderate+; omit for trivial)_

### Option A — <name>
- Summary: one line
- Trade-off: what it buys / what it costs
- Why considered / rejected

### Option B — <name>
- ...

### Option C — <name>
- ...

**Recommendation**: <A|B|C> — because <reason>.

## Design

Scale each subsection to its actual complexity. Short is fine.

### Architecture

Components and their responsibilities. Label every claim about existing code with `[evidence: ...]`.

### Data flow

How information moves. Diagrams optional.

### Interfaces

Public API, CLI flags, config keys, events — whatever crosses a boundary.

### Error handling

What can fail, how the system responds. `[assumption: ...]` any expected error rate or user behavior.

### Testing strategy

What tests exist, what tests will be added, what is deliberately not tested and why.

## Rollout

_(omit for trivial)_

Migration steps, feature flags, backfills, deprecation windows. Who needs a heads-up.

## Assumptions

_(collects every `[assumption: ...]` from the body; load-bearing ones marked `!`)_

- `[assumption: ...]`
- `[assumption!: ...]`

## Pre-mortem

_(complex only)_

### Likely failure modes
1. **<symptom>** — root cause: ... — mitigation: yes/partial/no
2. ...
3. ...

### Highest-leverage assumption
<assumption> — rework cost if wrong: ... — de-risk plan: ...

### Most likely surprise
<stakeholder/system> — surprised by ... — mitigation: ...

## Accepted risks

_(only if pre-mortem surfaces unmitigated risks the user accepts)_

- <risk> — accepted because <reason>, signed off by <user>

## Rejected critique

_(only if subagent critic produced findings you disagree with)_

- "<finding>" — rejected because <reason>

## Deferred

_(things explicitly out of scope but worth tracking)_

- <follow-up item> — reason deferred
