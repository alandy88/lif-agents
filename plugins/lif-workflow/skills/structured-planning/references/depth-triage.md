# Depth Triage

Classify the request into exactly one of three buckets before doing anything else. Output one line:

```
Scope: <trivial|moderate|complex> — <reason>
```

## Classification

### trivial

One of:

- Single file, single change, one obvious way to do it
- Decision between two named options with clear criteria
- Formatting, renaming, or mechanical edit
- Question with a lookup answer (no design involved)

**Signals**: "rename X to Y", "add a prop", "change the default", "which of A/B should I pick".

**Skip**: alternatives stage, subagent critic, pre-mortem.
**Keep**: explore, draft with evidence labels, placeholder scan, user approval.

### moderate

One of:

- New feature on an existing subsystem with unclear shape
- Refactor that touches 3–10 files or crosses a module boundary
- Choice among more than two approaches
- Any design that would produce a spec longer than ~1 page

**Signals**: "add a new command", "redesign this workflow", "how should we structure X".

**Run**: full flow minus subagent critic and pre-mortem.

### complex

Any of:

- New subsystem or greenfield project
- Touches data model, public API, cross-cutting concern, or auth
- Spans multiple independent subsystems (needs decompose)
- Irreversible or hard-to-reverse consequences (migrations, data loss risk)
- User explicitly requests "careful" or "rigorous" planning

**Signals**: "design the X system", "how do we architect Y", "plan the migration".

**Run**: all stages including subagent critic and pre-mortem.

## Override Rules

- User says "go deeper" / "more careful" / "rigorous" → upgrade one level
- User says "keep it light" / "quick" / "trivial" → downgrade one level
- You discover during exploration that the scope is larger than you thought → upgrade and state why
- Never downgrade silently on your own initiative

## Tie-breakers

When unsure between two adjacent levels, **pick the higher one**. The cost of extra rigor on a simple task is a few tokens; the cost of insufficient rigor on a complex task is wrong decisions shipped to code.
