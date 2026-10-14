---
name: plan-handoff
description: "Turns a settled plan into an implementation instruction with phases, slices and verification gates, saved to the lif-notes vault's handoff queue so a fresh agent can build it slice by slice. Use when a plan is approved and needs handing to another agent or session, or when the user runs /plan-handoff."
argument-hint: "[path or reference to the approved plan]"
disable-model-invocation: true
---

# plan-handoff

Write an implementation instruction for a plan that is already decided, so a fresh agent can execute it slice by slice with no design judgement left to make. Save to `$LIF_NOTES_VAULT/system/handoff/YYYY-MM-DD--<repo_name>--<topic>-implementation.md`, the queue's naming convention (`system/handoff/README.md`) that `handoff` also follows.

## Inputs

The plan is the argument, or the plan settled in this conversation. Before writing, collect from the plan and the repo:

- **Decisions** — every choice the plan resolved, written as fixed with its one-line reason. The agent builds on them rather than reopening them, and the reason lets it handle cases the plan did not list.
- **Baseline** — what the system does today, in a form that can be captured and compared (screenshots, test output, API responses, build artefacts). If nothing capturable exists, capturing it is slice 1.
- **Gotchas** — environment facts the repo does not confess (harness limits, service paths, known test noise). Copy them from the plan or prior handoff; do not re-derive.

## Structure

```markdown
---
repo: <repo path>
created: <YYYY-MM-DD>
goal: <one sentence>
---
# <goal>

Plan: <plan path>. Source handoff: <path or none>.

## Decisions (fixed)
- <decision>: <one-line reason>

## Rules for every phase
- <invariants for all slices: commit granularity, diff discipline, how to verify, known noise to tolerate>

## Phase 1: <name>

### Slice 1.1: <name>
- **Goal:** <what and why>
- **Scope:** <files in>; untouched: <files>
- **Context:** <paths, commands, interfaces it consumes or exposes>
- **Done when:** <the verification gate>

## Acceptance test
<last phase: proves the goal end to end, such as adding the second instance or running the new workflow cold; its gate is the bar the whole project is judged by>

## Done when
<merge state, recorded evidence, closing note>
```

Phases go in dependency order. Each slice is a reviewable commit that leaves the branch green, and its brief stands alone: concrete paths, commands and code shape, enough that a fresh agent builds it without the plan or the other slices.

## Slicing

- A slice changes one thing. A refactor slice and a behaviour slice never share a commit.
- A slice fits one agent session: the brief, the files it reads, and its test output stay well inside a 200k-token context. If a slice needs more, split it at an interface.
- Refactor slices are labelled **no-diff**: the gate is comparison against the baseline, measured (pixel-diff threshold, byte-identical output, test count unchanged), not "looks fine".
- Order so that risk surfaces early: merges and baselines first, contracts before consumers, the acceptance test last.
- Forbid speculation inside slices: a token, option, or abstraction exists only if a current consumer reads it. Say so in the rules.

## Verification gates

Every slice ends on a gate that is **checkable** (a command, a diff, a grep that returns nothing) and **exhaustive** (every affected surface listed, every mode — light/dark, on/off, each overlay). A gate the agent can satisfy by asserting is not a gate. Prefer:

- `grep` proofs that old literals are gone;
- pixel or byte comparison against baseline with a stated threshold;
- negative cases (feature disabled, bad input, missing id);
- a size or line-count ceiling on the acceptance artefact, with the instruction that exceeding it means a seam is missing — go back, not around.

## Pruning

Reference the plan for rationale rather than restating it. Keep the instruction under ~200 lines; if longer, the plan was not settled — push the open question back to the user instead of resolving it in the instruction.
