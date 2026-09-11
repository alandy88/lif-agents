# Pre-mortem

For `complex` depth only. Before asking for user approval, answer three questions in a `## Pre-mortem` section at the bottom of the artifact. The exercise: imagine the plan has been executed and the outcome is bad. What happened?

## The three questions

### 1. Assume this shipped and failed within 6 months. What were the three most likely causes?

List three failure modes, each with:

- **Symptom** — how the failure was noticed
- **Root cause** — what actually went wrong
- **Whether the current design already mitigates it** — yes / partially / no

If a root cause has `no` mitigation, the design must be revised or the risk must be explicitly accepted (with user sign-off) in a `## Accepted risks` section.

### 2. Which assumption, if wrong, causes the largest rework?

Name the single assumption. State:

- What we'd have to redo
- Approximate cost (in scope, not hours)
- Whether we can cheaply de-risk it before committing (e.g., a quick probe, a measurement, a spike)

If de-risking is cheap and the rework cost is high, **do the de-risk step first** and update the artifact with findings before asking for approval.

### 3. Who or what is most likely to be surprised when this lands, and by what?

List any stakeholder, system, or consumer that might not know this is coming, and what specifically surprises them. Examples: downstream service, oncall team, existing users' workflows, an API consumer, a sibling feature team.

For each, decide: does the rollout plan already address this? If not, add a mitigation (heads-up, migration note, deprecation window, feature flag).

## Revision trigger

If any of the three questions surfaces something the design does not already handle, revise the design. It is far cheaper to revise on paper than after the code is written.

## Keep it tight

Pre-mortem is not an exercise in paranoia. Three failure modes, one high-leverage assumption, one surprise vector. If you find yourself listing ten failure modes, you are probably padding — pick the three that actually scare you.
