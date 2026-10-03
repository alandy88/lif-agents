# Self-Critique Checklist

Run these four scans on the drafted artifact once. Fix issues inline, then move on. If a scan surfaces something you cannot fix without more input, surface it to the user instead of papering over it.

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
