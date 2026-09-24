---
name: plan-handoff
description: Turn a settled plan into an implementation instruction with phases, slices, and verification gates.
argument-hint: "[path or reference to the approved plan]"
disable-model-invocation: true
---

Write an implementation instruction for a plan that is already decided, so a fresh agent can execute it slice by slice with no design judgement left to make. Save to `$LIF_NOTES_VAULT/system/handoff/<date>-<topic>-implementation.md`.

## Inputs

The plan is the argument, or the plan settled in this conversation. Before writing, collect from the plan and the repo:

- **Decisions** — every choice the plan resolved. Each is written into the instruction as fixed; the agent must never reopen one.
- **Baseline** — what the system does today, in a form that can be captured and compared (screenshots, test output, API responses, build artefacts). If nothing capturable exists, capturing it is slice 1.
- **Gotchas** — environment facts the repo does not confess (harness limits, service paths, known test noise). Copy them from the plan or prior handoff; do not re-derive.

## Structure

1. **Header** — repo, plan path, source handoff path.
2. **Decisions (fixed)** — one line each.
3. **Rules for every phase** — invariants that apply to all slices: commit granularity, diff discipline, how to verify, known noise to tolerate.
4. **Phases** in dependency order. Each phase:
   - one or more **slices**, each a PR-sized commit that leaves `main` shippable;
   - concrete file paths, commands, and code shape — enough that another developer implements it without reading the plan;
   - a **Verify** block.
5. **Acceptance test** — the last phase proves the goal end to end (add the second instance, run the new workflow cold). Its gate is the bar the whole project is judged by.
6. **Done when** — merge state, recorded evidence, closing note.

## Slicing

- A slice changes one thing. A refactor slice and a behaviour slice never share a commit.
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
