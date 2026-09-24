# Self-Critique Checklist

Run these four scans on the drafted artifact with fresh eyes. Fix issues inline. No re-review loop — scan once, fix, move on. If a scan surfaces something you cannot fix without more input, surface it to the user instead of papering over it.

## Scan 1 — Placeholder Scan

Search the artifact for:

- `TBD`, `TODO`, `XXX`, `FIXME`
- `[assumption!: ...]` (load-bearing assumptions — confirm or reduce)
- Vague words: "some", "various", "appropriate", "reasonable", "efficient", "robust", "scalable"
- Empty sections or single-bullet sections that promise more
- Unresolved alternatives ("we could do A or B")

**Fix**: replace with a specific value, decision, or `[assumption: ...]` label.

## Scan 2 — Contradiction Hunt

Read sections pairwise in your head. Check for:

- Does the architecture match the feature list?
- Does the data flow match the component responsibilities?
- Do the non-goals contradict any stated goal?
- Does the pre-mortem (if present) surface a risk the design already claims to handle?
- Do two assumptions conflict (e.g., "low traffic" + "requires horizontal scaling")?

**Fix**: remove or reconcile.

## Scan 3 — Scope Check

- Is this one artifact, or three wearing a trench coat?
- Would implementing this produce a PR larger than a reviewer can digest?
- Are there independent subsystems that should each get their own artifact?

**Fix**: decompose. Write one artifact, mark the others as follow-ups in a `## Deferred` section.

## Scan 4 — Ambiguity Scan

Re-read every requirement, every bullet in the design, every diagram caption. For each, ask: **"Can this be interpreted two different ways by a careful reader?"**

Common ambiguity traps:

- "Handles errors" — which errors, how?
- "Users can configure X" — where, who, at what granularity?
- "Integrates with Y" — via what interface, sync/async, auth how?
- Pronouns without clear antecedent ("it", "this", "they")

**Fix**: pick one interpretation and make it explicit.

## Red-team Questions (pass over the whole artifact)

Ask these five questions of the draft as if you were a skeptical reviewer:

1. What is the single most likely way a reader misreads this?
2. Which assumption, if wrong, causes the largest rework?
3. What is in scope that shouldn't be? What is out of scope that should be in?
4. Where does the artifact lean on vibes instead of evidence?
5. If I had to cut this artifact in half, what would I keep?

You do not need to answer these in writing. You do need to revise the artifact if any question reveals a weakness.
