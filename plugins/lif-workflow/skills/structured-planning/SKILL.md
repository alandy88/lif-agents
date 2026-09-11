---
name: structured-planning
disable-model-invocation: true
description: "Use when planning a feature, designing a system, drafting a spec/RFC, or making a non-trivial architectural decision."
argument-hint: "[topic or question] [--depth trivial|moderate|complex] [--out <path>]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, TodoWrite
---

# structured-planning

## Overview

Turn an idea into a validated artifact (design, plan, decision record) through a gated pipeline. Depth adapts to scope: trivial tasks run a fast single-pass flow, complex ones run multi-stage reasoning with independent subagent critique and pre-mortem.

The skill is **rigid** where it matters (evidence labeling, gates, alternatives) and **flexible** on section content. Do not skip gates, even if the task "feels simple".

## Hard Gate

Do NOT write implementation code, invoke implementation skills, or commit irreversible actions until the artifact is written, self-reviewed, and the user has approved it. This applies at every depth level.

## Checklist

Create a TodoWrite task for each step and complete them in order. Steps marked `[moderate+]` or `[complex]` run conditionally based on depth.

1. **Scope triage** — classify `trivial | moderate | complex`, state reason
2. **Explore context** — read relevant files, docs, recent commits
3. **Decompose** `[complex]` — if the request spans independent subsystems, list them and pick one to plan first
4. **Clarify** — ask blocking questions one at a time (only if truly blocking; otherwise state assumptions)
5. **Alternatives** `[moderate+]` — propose 2–3 approaches with trade-offs, recommend one
6. **Draft artifact** — with evidence labels on every claim (see `references/evidence-labeling.md`)
7. **Self-critique** `[moderate+]` — run the four scans in `references/self-critique-checklist.md`, fix inline
8. **Subagent critic** `[complex]` — dispatch via `references/subagent-critic.md`, revise against findings
9. **Pre-mortem** `[complex]` — answer the three questions in `references/pre-mortem.md`, revise
10. **User approval** — present artifact path, request review
11. **Handoff** — invoke next skill or stop per user direction

## Process Flow

```
[Scope Triage]
   ├── trivial  ── Explore → Clarify → Draft+Evidence → Self-scan → Approve → Handoff
   ├── moderate ── Explore → Clarify → Alternatives → Draft+Evidence
   │                → Self-critique → Revise → Approve → Handoff
   └── complex  ── Explore → Decompose → Clarify → Alternatives → Draft+Evidence
                    → Self-critique → Subagent Critic → Pre-mortem
                    → Revise → Approve → Handoff
```

## Stage Rules

### Scope Triage (always first)

Output one line before anything else:

```
Scope: <trivial|moderate|complex> — <one-sentence reason>
```

See `references/depth-triage.md` for classification rules. The user may override by saying "go deeper" (upgrade) or "keep it light" (downgrade). Never silently downgrade on your own; upgrading on new evidence is allowed if you state why.

### Explore Context

- Read the project's CLAUDE.md if present
- Glob for files relevant to the topic; read the most relevant ones
- Check recent commits touching the area (`git log --oneline -20 -- <path>`)
- Record what you found; do NOT infer from filenames alone

### Decompose (complex only)

If the request contains multiple independent subsystems (e.g., "build a platform with auth, billing, analytics"), list each subsystem as its own potential artifact. Confirm with the user which one to plan first. Each subsystem gets its own structured-planning pass.

### Clarify

- Ask only questions whose answers change the artifact
- One question per message, prefer multiple choice
- If a question is not blocking, state an assumption with `[assumption: ...]` and continue
- Never batch 3+ questions in one message

### Alternatives (moderate+)

Propose 2–3 distinct approaches. For each:

- One-line summary
- Primary trade-off (what it buys, what it costs)
- Concrete evidence or analogy supporting feasibility

Lead with your recommendation and explain why. Never present a single option as "the approach".

### Draft Artifact

- Use `assets/artifact-template.md` as the starting skeleton
- Default location: `docs/plans/YYYY-MM-DD-<topic>.md` (override with `--out`)
- Every design claim must carry `[evidence: ...]` or `[assumption: ...]` — see `references/evidence-labeling.md`
- Scale each section to its complexity; do not pad

### Self-Critique (moderate+)

Run the four scans in `references/self-critique-checklist.md`:

1. Placeholder scan (TBD, TODO, vague words)
2. Contradiction hunt
3. Scope check (one artifact, or decompose further?)
4. Ambiguity scan (any claim readable two ways?)

Fix inline. No re-review loop — fix and move on.

### Subagent Critic (complex only)

Dispatch a `general-purpose` subagent with the prompt in `references/subagent-critic.md`. Give it **only** the artifact file and the original user request — no prior reasoning. Revise against any finding you accept; record rejected findings and why at the bottom of the artifact under `## Rejected critique`.

### Pre-mortem (complex only)

Answer the three questions in `references/pre-mortem.md` in a dedicated section of the artifact. Revise the plan if the pre-mortem surfaces a failure mode that is not yet mitigated.

### User Approval

Tell the user:

> "Artifact written and committed to `<path>`. Please review and let me know if you want changes before handoff to `<next-skill-or-none>`."

Wait for response. If changes requested, apply them and re-run self-critique (and subagent critic + pre-mortem if complex).

### Handoff

After approval, invoke the next skill the user specified, or stop. Common handoffs:

- `writing-plans` — when the artifact is a design that needs an implementation plan
- `/skill-designer` — when the artifact designs a new skill
- `executing-plans` — when the artifact already contains an actionable plan
- None — when the artifact itself is the deliverable (decision record, research memo)

Ask the user which handoff applies if it is not obvious.

## Reference Map

- `references/depth-triage.md` — classify trivial / moderate / complex
- `references/evidence-labeling.md` — `[evidence: ...]` / `[assumption: ...]` rules
- `references/self-critique-checklist.md` — four scans + red-team questions
- `references/subagent-critic.md` — dispatch template and critic prompt
- `references/pre-mortem.md` — three mandatory failure-mode questions
- `assets/artifact-template.md` — starting skeleton for the output file

## Key Principles

- **Scope first, always** — wrong depth wastes tokens or misses risk
- **Evidence or assumption** — no bare claims; label every non-obvious statement
- **One question at a time** — never batch
- **Alternatives mandatory** at moderate+; first-idea bias is the default failure mode
- **Fresh-eyes critique** — subagent has no prior context, which is the feature
- **Pre-mortem before approval** — cheaper to revise on paper than in code
- **Gates are non-negotiable** — even for "obvious" tasks
