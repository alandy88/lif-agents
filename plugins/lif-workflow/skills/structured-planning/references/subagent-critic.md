# Subagent Critic

For `complex` depth only. Dispatch a fresh-context agent to critique the artifact. The value is that it has **none** of your reasoning history, which removes confirmation bias.

## Dispatch

Use the `Agent` tool with `subagent_type: "general-purpose"`. Give it:

- The absolute path to the artifact file
- The original user request (verbatim, as the user wrote it)
- The critic prompt below

Do **not** include your own reasoning, your chosen approach, or any context about why you made specific decisions. The point is for the critic to react to the artifact cold.

## Critic Prompt Template

```
You are reviewing a planning artifact for rigor, accuracy, and completeness.
The original user request was:

---
<ORIGINAL USER REQUEST>
---

The artifact is at: <ABSOLUTE PATH TO ARTIFACT FILE>

Read the artifact once all the way through, then answer:

1. **Unlabeled claims** — list every factual statement that lacks an
   [evidence: ...] or [assumption: ...] label. For each, say whether you
   believe it is a fact (needs evidence) or a guess (needs assumption label).

2. **Load-bearing assumptions** — list the assumptions most likely to be wrong.
   For each, describe what breaks if it is wrong.

3. **Missing alternatives** — what obvious approach did the artifact not
   consider? Only list alternatives that would meaningfully change the design,
   not variations.

4. **Scope and ambiguity** — what requirements could a careful reader
   interpret two ways? What is in scope that should be out, or vice versa?

5. **Internal contradictions** — any section that conflicts with another?

6. **Verdict** — one of:
   - approve: minor or no issues
   - revise: real issues that change the design
   - reject: the design has a fundamental problem; state it in one sentence

Report every finding with a severity (high, medium, low); the author filters
afterwards, so a finding left out is lost. Write findings plainly, without
praise. Critique the artifact; leave rewriting it to the author.
```

## Processing the critique

For each finding the critic returns:

- **Accept** → revise the artifact
- **Reject** → note it in the artifact under `## Rejected critique` with one
  sentence on why you disagree

Record every finding as accepted or rejected. If you reject all of them,
re-read the highest-severity one against the code before moving on.

After revising, do NOT dispatch a second critic pass unless the revision was
structural. Small edits don't need re-review; structural changes do.
