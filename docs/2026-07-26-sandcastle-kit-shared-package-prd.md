# Sandcastle Kit — Shared Agent-Orchestration Package

**Status:** Accepted (2026-07-26). D1–D3 settled. This repo is public and CI green. **P-pre done** (2026-07-26, in `lif-studio`). **P1 done** (2026-07-26) — the core is extracted here with its tests; no consumer has cut over. **`presets/implement` done** (2026-07-26), ported from `comfyui-lif-nodes` — see below. **Architecture section accepted** (2026-07-26) and implemented: the phase layer (`src/phases/`) exists, both presets are compositions, and **`presets/task` is done** (98 tests green) — P2 is no longer blocked. Packaging revised the same day: `dist/` ships in release tags, not on `main`. **P3 (`comfyui-lif-nodes`) is next**, with P0 runnable in parallel; P2 (`Morrow`) follows. No release tag has been cut through the new workflow yet — that precedes any consumer cutover.

**Owner:** Peter Yu

**Where this lives.** The kit is built first and the consuming repos migrate onto it, so the plan lives here rather than in any one consumer. Phases that are consumer-side work (P-pre and P0 in `lif-studio`, P2–P4 in each repo) are tracked here and executed there.

## Summary

Three repos now carry their own `.sandcastle/` agent-orchestration tree — `lif-studio`, `comfyui-lif-nodes`, and `Morrow`. They started as copies of one another and have diverged in both direction and quality: the newest ideas live in the smallest copy, the operational hardening lives in the largest, and no repo has both.

This PRD proposes extracting the repo-agnostic engine into an installable node package (`@lif/sandcastle-kit`), consumed by git-URL tag, leaving each repo a thin `.sandcastle/` containing only what genuinely knows its toolchain.

## Problem statement

1. **Verbatim duplication already exists.** `.sandcastle/lib/host-exec.mts` is *byte-identical* between `Morrow` and `comfyui-lif-nodes`. It is a pure git/gh shell seam with zero repo knowledge and has no reason to exist three times.

2. **Improvements do not propagate.** `comfyui-lif-nodes` has a prompt-injection defence (`defangShellExpansion`, neutralising `` !` `` shell-expansion blocks in attacker-writable issue bodies before template substitution — currently inlined in `workflows/implement/main.mts`, not a standalone module), trailer-based run resume, per-phase model routing, and ChatGPT-subscription Codex auth. None of it reached `lif-studio` or `Morrow`. Conversely `lif-studio`'s green-check gating, run logging, usage tracking, and phase deadlines never reached the other two. The defang gap is not just drift — `lif-studio` runs unattended issue-driven jobs against attacker-writable issue bodies **today**, so it is a live exposure and is handled ahead of the extraction (see P-pre).

3. **Version skew is already blocking.** `lif-studio` pins `@ai-hero/sandcastle@^0.10`; the other two pin `^0.12`. Nothing can be shared across that gap.

4. **Cost scales with repo count.** `lif-studio`'s `.sandcastle/` is ~8,300 lines (tests included) across 26 lib modules; `comfyui-lif-nodes` ~1,600 across 5; `Morrow` ~450. Every security fix, provider addition, or sandcastle upgrade is currently an N-repo change with N chances to be forgotten — and the repos run unattended (AFK label-triggered runs), so a missed fix is silent.

## Goals

- One implementation of every module that does not know the consuming repo's toolchain.
- A new repo can adopt the agent pipeline by writing **one file** (`.sandcastle/config.mts`) plus a `Dockerfile`.
- Security and correctness fixes land once and reach every consumer on an explicit version bump.
- Consumers upgrade deliberately. A kit change must never alter an unattended run without someone bumping a pin.
- `Morrow` (a separate project under `strawcake1/`) can consume the kit without depending on the `lif-studio` monorepo.

## Non-goals

- **Not a superset orchestrator.** The kit will not grow one lifecycle that serves all three repos. `Morrow` has no GitHub issue source at all; its `workflows/task` loop is a genuinely different shape from the issue-driven loops. Lifecycles ship as opt-in presets, not as inherited behaviour.
- **Not a rewrite.** Extraction is behaviour-preserving; tests move with their modules.
- **Not a published npm registry package.** Git-URL consumption matches the existing `lif-datafiles` → `comfyui-lif-nodes` precedent (ADR-0024/0033/0034) and needs no publish infrastructure.
- **Not collapsing per-repo Dockerfiles.** Toolchains genuinely differ (uv / bun / dotnet).

## Target design

### Module boundary

The test for any module: *if it cannot be written without naming a package manager, a test command, or a repo layout, it stays in the repo.*

| Layer | Disposition | Rationale |
|---|---|---|
| `host-exec`, `github-issue` / `issue-source`, `task-list`, `task-loop`, `profiles`, `defang` + `renderPrBody`, `retry`, `semaphore` | **Kit** | Zero repo knowledge; already identical or trivially unifiable, or (defang) security-critical for every consumer |
| `workflows/implement` (issue-driven), `workflows/task` (local state) | **Kit, opt-in presets** | One repo's lifecycle is not another's; consumers import what they run |
| Epic/swarm lanes, green-check, `run-logging`, `usage-log`, `phase-deadline` | **Repo-local until a second consumer exists** | Zero repo knowledge but one consumer (`lif-studio`); the junk-drawer rule applies — graduate on demand |
| `config.mts`, `Dockerfile`, preflight commands, verify/test command | **Repo, always** | This *is* the per-repo part |
| Prompt templates | **Kit defaults + repo override** | Kit ships defaults; repo overrides by path and injects a `CONVENTIONS` argument |

### Base implementation

The kit's core is derived from **`comfyui-lif-nodes`**, not `lif-studio`: the checklist ralph loop (`task-loop.mts`, 102 lines), `Task-Done:` git-trailer resume, per-phase model routing (`phaseProfiles` — plan/review on Opus, build on Codex), and the runtime-free `profiles.mts` seam. `lif-studio`'s operational modules (green-check, run logging, usage tracking, epic lane, output-schema repair) **stay repo-local** and graduate into the kit only when a second repo adopts them (see P4 and the junk-drawer rule).

### Package shape

```
lif-sandcastle/
  package.json          "@lif/sandcastle-kit", "type": "module"
  src/lib/*.mts         host-exec, task-list, task-loop, profiles, github-issue, …
  src/phases/*.mts      modular stages: plan, task, review, verify, deliver (see Architecture)
  src/presets/*.mts     implement (GitHub issues), task (local state) — compositions of phases
  templates/*.md        default prompts
  dist/                 tsc output — .mjs + .d.mts (in release tags only; see below)
  .github/workflows/agent.yml   on: workflow_call
```

**`@ai-hero/sandcastle` is a regular dependency of the kit** (`^0.12`), ~~a peerDependency~~. **Revised 2026-07-26** — the original decision made consumers keep pinning sandcastle themselves, on the reasoning that a peer range makes the kit's API assumption installable-checkable rather than implicit. That reasoning holds only if consumers also *call* sandcastle directly. Under the target design they do not: the kit is the abstraction and sandcastle is its implementation detail, so a peer range is a demand on the consumer's `package.json` — the same leak as a sandcastle import, one level up. A consumer now names exactly one dependency, the kit, at one pinned tag.

Version skew (problem 3) is not reintroduced: the kit owns the version, and a sandcastle major bump is still a kit release plus N consumer tag bumps. `lif-studio` keeps its own direct sandcastle dependency through P4 because its repo-local swarm lifecycle calls the API directly (`Output`, `StructuredOutputError`, `docker`, `OutputDefinition`); npm hoists the two to one copy while the ranges overlap. If that repo ever adopts a preset, the kit re-exports that surface rather than letting a second pin exist.

**Build to `dist/`; do not ship raw `.mts`.** All three consumers run TypeScript directly today (tsx or bun), which makes shipping sources tempting — but `.mts` inside `node_modules` is exactly where tsx/bun dependency-transpilation behaviour is inconsistent. `tsc` with declarations is cheap now that the repos are on TS 7.

Two details the scaffold settled:

- **Output is `.mjs`, not `.js`.** `.mts` sources under `module: nodenext` emit `.mjs`. Sources stay `.mts` so P1 modules move over unchanged, and the exports map follows the emit rather than the other way round.
- **`dist/` ships in release tags, not on `main`.** **Revised 2026-07-26** — originally `dist/` was committed on `main` (with CI running `git diff --exit-code -- dist` against staleness), because git-URL consumers install without a registry and the runners' `bun install` `prepare`-on-git-dep handling is not something an unattended pipeline should rest on. The premise holds — built output must be in the git tree consumers install — but it never needed to be in `main`'s history: consumers pin tags, never `#main`. So `dist/` is now gitignored on `main`, and `.github/workflows/release.yml` builds, tests, and cuts each `vX.Y.Z` tag from a commit that force-adds `dist/` (a child of `main` HEAD living only behind the tag ref). Both installers still see identical built output; `main` loses the build-artifact diff noise; and `#main` becomes uninstallable, which converts the tag-pinning rule from policy into packaging. (Also noted for P1: TS 7 does not auto-include `@types/*` — `"types": ["node"]` is required for node builtins.)

```json
"exports": {
  ".":            "./dist/index.mjs",
  "./lib/*":      "./dist/lib/*.mjs",
  "./presets/*":  "./dist/presets/*.mjs",
  "./templates/": "./templates/"
}
```

### Consumer contract

```bash
npm i -D github:alandy88/lif-sandcastle#v0.1.0
```

```ts
// .sandcastle/config.mts — the only file a consumer writes, and the CLI entry
import { isEntrypoint, runImplementLoop } from "@lif/sandcastle-kit/presets/implement";

const config = { toolchain: "python" } as const;

export default config;

if (isEntrypoint(import.meta.url)) await runImplementLoop(config);
```

**The toolchain is a choice from a kit-owned standard, not a description.** `python` means uv, `node` means npm, `dotnet` means the dotnet CLI — the kit owns the warm-up commands, the canonical test command, and the conventions block each implies. The rejected alternative was a free-text `conventions` string (and a sibling `verify`), which let three repos invent three dialects of the same toolchain; the repo that told an agent to run bare `pytest` would fail only at runtime, unattended, as a confusing import error. Adding or amending a toolchain is a kit change with a test, and every consumer that picks it inherits the fix — the same argument as the rest of the extraction, applied to the prompts. `extraConventions` and `preflight` remain for what a toolchain name genuinely cannot imply (a second test suite at repo-specific paths, a generated-file step); both are additive.

**One import, and it is the kit.** No `@ai-hero/sandcastle` in a consumer's imports, `package.json`, or typecheck — anything typed as a sandcastle object (an agent provider, a sandbox provider) is therefore excluded from the config interface by construction. Where a consumer genuinely needs to vary sandbox construction, the kit grows a declarative option whose types it owns, not a hook returning somebody else's. Two unit tests hold this: no `@ai-hero` type in a preset's emitted `.d.mts`, and no peer range in the manifest.

**Pin a tag, never `main`.** AFK runs fire unattended; a kit change must not reach a repo's next run without an explicit bump.

### Reusable GitHub Actions workflow

The kit repo also ships `.github/workflows/agent.yml` with `on: workflow_call`. Each consumer's `sandcastle-agent.yml` collapses to a `uses:` line plus secrets — the other half of "define once".

**Cross-owner caveat:** `strawcake1/Morrow` calling a workflow in an `alandy88/` repo only works if the kit repo is **public**; private reusable workflows do not cross owners. Likewise, a private kit means Morrow's CI needs an `alandy88` credential just to `npm i` the git URL. If the kit stays private, Morrow keeps its own thin `sandcastle-agent.yml` and only the npm package is shared — the `uses:` collapse applies to the `alandy88/` repos only. This feeds into D2.

### Template resolution

Sandcastle's `promptFile` is a path relative to the sandbox workspace (today `.sandcastle/templates/implement/task-prompt.md`). Once defaults live in `node_modules/@lif/sandcastle-kit/templates/`, that path only resolves if `node_modules` sits inside the mounted workspace *and* install has already run. Per D1 the kit resolves them in place:

```ts
import { templatePath } from "@lif/sandcastle-kit";

const promptFile = templatePath("implement/task-prompt.md", {
  overrideDir: ".sandcastle/templates",   // repo override wins when present
});
```

## Architecture

**Added 2026-07-26.** Settled in review with the owner after the P1/`presets/implement` landings, before P2/P3. This section is the target the phasing builds toward; nothing in it reorders the phasing.

### Two contracts, different rigidity

The kit's job splits into two contracts, and they deliberately differ in how negotiable they are:

- **The practice layer is non-negotiable.** Toolchain choice from the kit-owned standard (`python` *is* uv), `defang` on every prompt argument, tag-pinned installs, the sandcastle boundary (consumers never name `@ai-hero/sandcastle`), provider credential handling, and the conventions block. A consumer that composes a custom lifecycle still gets all of it, because it is baked into the primitives every phase runs through. There is no mix-and-match here.
- **The lifecycle layer is composable.** Stages of a lifecycle — plan, task, review, verify, deliver — are the unit of reuse, not whole lifecycles. Consumers either run a shipped preset as-is, override its templates, or compose phases directly.

### Layers

```
Layer 0  @ai-hero/sandcastle       kit-internal dependency; never consumer-visible
Layer 1  src/lib/                  primitives = the practice layer
                                   (host-exec, defang, toolchains, profiles,
                                    provider-setup, templates, task-list, task-loop)
Layer 2  src/phases/               modular stages: plan · task · review · verify · deliver
                                   each = runner fn + default template + typed inputs/outputs
Layer 3  src/presets/              standard compositions
                                   implement = github-issue → plan? → loop(task) → review → PR
                                   task      = ledger      →          loop(task) → verify → squash-merge
Layer 4  consumer config.mts       pick a preset, override its templates,
                                   or compose phases directly (lif-studio's swarm lanes)
```

A phase is deliberately boring: an async function taking a shared `PhaseContext` (agent, sandbox, branch, template resolver, per-phase profile) plus phase-specific inputs, returning a typed result. Composition is plain TypeScript — a preset is a thin file calling phase functions in order. **No pipeline engine, no DAG config format, no plugin registry.** A consumer that wants mix-and-match writes exactly what a preset writes internally.

Two adapter seams sit beside the phases, because they are where the consumers genuinely diverge:

- **Task source:** GitHub issue checklist (`comfyui-lif-nodes`, `lif-studio`) vs. `STATE.md` ledger (`Morrow`).
- **Delivery:** PR-per-issue vs. squash-merge-and-continue.

The second-consumer rule is what justifies the phase layer *now* rather than speculatively: the moment `presets/task` exists, the task phase (run session → expect commits → retry once → record trailer) has two consumers — `task-loop.mts` already proved the overlap. `review` (artifact-producing) and `verify` (binary gate) stay separate phases; they are different contracts, not one parameterized thing. Writing `presets/task` in P2 is therefore the forcing function to decompose `presets/implement` into `phases/` and re-express both presets as compositions — behaviour-preserving (same templates, same flow, preset tests keep passing), with `presets/implement` shrinking to composition glue.

This also settles how `lif-studio` relates to the kit long-term: its swarm does not adopt a preset wholesale, nor stay walled off — it becomes a **Layer-4 composer**, keeping lane/epic/parallelism machinery repo-local while each lane's inner loop calls kit phases. Prompt and practice improvements land once; swarm orchestration stays repo-local per the junk-drawer rule.

### Target end-to-end flow (north star)

The full lifecycle the layers exist to serve. Capabilities marked ⊕ do not exist yet and land *after* the migration phases, one kit release at a time.

1. **Ideation → issue.** Brainstorming happens in any client, outside the kit; the pre-implementation passes (blind-spot, brainstorm/prototype, interviews, references) are interactive and stay client-side. The kit defines only the **issue body contract** the planner consumes (problem statement, references, resolved questions, acceptance criteria). ⊕ Optionally, a cheap async `triage` phase runs a blind-spot pass on a freshly labeled issue and posts open questions as comments before the expensive lifecycle starts.
2. **`ready-for-agent` → plan.** The plan phase slices the work into deliverable chunks and ⊕ declares a dependency DAG over them (which slices must be sequenced, which can run in parallel). Today's flat checklist is the degenerate all-sequential case.
3. **Per slice: implement + review loop.** ⊕ The review step gains fresh-context inner rounds with a severity taxonomy (critical / must-fix / should / nit) baked into the template and a round cap (2–3); each round fixes criticals and must-fixes, then re-reviews. Both steps append to the cross-session notes artifact (decisions, assumptions — harvested into the PR body). ⊕ Open questions are posted **to the GitHub issue with a severity**, not to a file on the branch — answerable from any client. Non-critical questions accumulate for the end; a critical blocker halts the run: commit + push, post the questions as an issue comment, swap `ready-for-agent` → `needs-human`.
4. **Resume.** Trailer-based resume from `origin/agent/issue-N` exists; ⊕ blocked-state resume additionally records which slice blocked and injects the human's Q&A answers into the resumed session's context.
5. **Deliver (merger).** ⊕ Collect the branch, open the single PR with the harvested notes as body, wait for CI checks green, request a cross-agent review (e.g. Codex), address criticals once, then hand to the human. The outcome of the whole flow is a PR ready for human approval that already followed the practice layer end to end.

### Decided: branch topology follows the plan's DAG

The rejected alternative was per-slice sub-PRs into a feature branch as the universal shape. What per-slice PRs buy decomposes into three things with cheaper substitutes: per-slice *verification* already happens in-sandbox via the toolchain's test command; per-slice *CI* needs only a workflow triggered on push to `agent/**` branches (the agent pushes after each slice; the next session or the merger reads check status via `gh` and repairs while context is fresh); only per-slice *PR-ergonomic review* genuinely wants a PR, and the in-sandbox review phase already covers that role per-iteration, with the cross-agent PR review running once on the final PR.

So: **all-sequential slices → single branch, CI-on-push, one PR at the end** (sub-PRs there are ceremony plus rebase churn plus PR state to reconcile on every resume). **Any parallel slices → integration branch + per-slice lanes**, because parallel work needs branch isolation and an integration point anyway, at which point per-slice PRs into the integration branch are nearly free checkpoints. Topology is a consequence of the plan's DAG, not a global configuration choice.

### Decided: planner-driven slicing; parent issues for large work

Two slicing levels stay distinct:

- **Child issue** = one deliverable PR — the unit of human review and merge.
- **Slice** (checklist item inside one issue) = one implement+review iteration — the unit of agent context. Intra-PR only.

Genuinely large work becomes a parent issue with children (native GitHub sub-issues). ⊕ The epic flow is a recursion, not a new lifecycle: an **epic orchestrator** reads the parent's sub-issues and dependency annotations, runs the standard single-issue lifecycle on each child (independent children in parallel lanes, dependent ones sequenced), and the parent is pure bookkeeping — sub-issue progress plus a closing comment linking the child PRs. Each child produces its own PR; there is no mega-PR. The existing `issueIsEpic` guard in `presets/implement` (which today rejects epics) becomes the dispatch point.

On *who* slices: both work, and the planner is the default. If the plan phase concludes a single issue exceeds a threshold, it creates the child issues itself and converts the issue to a parent (optionally posting the proposed split as a comment first for a human checkpoint). Hand-pre-sliced parents behave identically — the orchestrator does not care who created the children. This avoids forcing correct work-sizing at ideation time.

### Build order

Migration first, on current behaviour: the phase decomposition rides P2 (writing `presets/task` forces it), P3 cuts `comfyui-lif-nodes` over, P4 has `lif-studio` adopt `lib/` while its swarm stays a repo-local composer. Only then do the ⊕ capabilities land, each as its own small kit release against a single source of truth: severity-gated review loop → blocker halt/resume → merger with CI-wait and cross-agent review → epic orchestrator → triage phase. Building the north-star flow before the consolidation would mean building it three times.

## Phasing

**P-pre — Backport `defangShellExpansion` immediately, outside the extraction. ⚠️ Recorded done 2026-07-26; found never landed (review, same day).** Cherry-pick the defence into `lif-studio`'s issue-driven pipeline (and `Morrow`'s if its prompt inputs are ever attacker-writable) *now*, as plain copies. A third copy for a few weeks is acceptable; an unattended pipeline substituting undefanged issue bodies for the duration of a multi-phase extraction is not. The kit's regression test (acceptance criterion 6) is the durable fix; this is the stopgap. Nothing else in the plan depends on it and nothing blocks it.

> **Correction (2026-07-26, from the P4 PR review):** the landing note below described a working tree that was never committed. The parallel session's work — `defang.mts` + `defang.test.mts` and the two call-site edits — sits in `lif-studio`'s `stash@{0}` ("sandcastle defang shell-expansion security fix"); `git log --all -S defangShellExpansion` shows no commit touching `.sandcastle/`. The same review also recalibrated the risk: sandcastle ≥ 0.10 already neutralizes `` !`…` `` blocks arriving via `promptArgs` — `substitutePromptArgs` marks template-authored expansion blocks and strips the marker from arg values, so substituted issue bodies are inert literals. Defang is therefore **defence-in-depth against the upstream marker scheme regressing, not a live-hole fix**, which voids this phase's urgency rationale. Resolution: drop the stash; the durable defence is the kit's `defangPromptArgs`, which `lif-studio` adopts with the kit (P4 follow-up) — the other two consumers already get it via the presets.
>
> ~~**Landed:**~~ (inaccurate — preserved for the record) `lif-studio/.sandcastle/lib/defang.mts` + `defang.test.mts` (verbatim copy of the `comfyui-lif-nodes` inline pair), applied at the two `promptArgs` construction sites — `lib/run-session.mts` (the live vector: implement+review share one args map, and `templates/implement/review-prompt.md` is the one template that expands `` !`…` `` after arg substitution) and `lib/run-retro.mts`. Registered in the `typecheck` and `test:sandcastle-lib` scripts; suite green at 208 tests. `Morrow` needs no backport — it has no issue source and no template in `.sandcastle/` uses `` !` `` expansion. The `templates/agent-spike/` scaffold was left alone: it is not the production pipeline and uses no expansion. P1 replaces this copy with the kit module.

**P0 — Version unification (blocks P4 only).** Bring `lif-studio` from `@ai-hero/sandcastle@^0.10` to `^0.12`, matching the other two. The kit's base (`comfyui-lif-nodes`) is already on `^0.12`, so P1–P3 do not need this — only `lif-studio`'s own cutover does. P0 is plausibly the most expensive single step (~8,300 lines across two sandcastle minors); run it in parallel with P1–P3 rather than in front of them.

**P1 — Extract the identical core. ✅ Done 2026-07-26.** Move `host-exec`, `task-list`, `task-loop`, `profiles`, `github-issue` into the kit with their tests, plus `defangShellExpansion` extracted out of `workflows/implement/main.mts` into a kit module with its regression test. Behaviour-preserving; no consumer changes yet.

> **Landed** in `src/lib/` (from `comfyui-lif-nodes`, per the base-implementation decision), re-exported from `src/index.mts`, built to `dist/`. Suite is 46 tests green: `profiles`, `task-list`, `task-loop`, and `templates` as migrated, plus `host-exec` and `defang` tests taken from `lif-studio` (`comfyui-lif-nodes` had none for either — its defang tests lived inside `workflows/implement/main.test.mts`).
>
> Two things the move corrected, both worth carrying into the consumer cutovers:
>
> - **`host-exec` was *not* three copies of one file.** Problem statement 1 is right that `Morrow` and `comfyui-lif-nodes` are byte-identical, but `lif-studio`'s `capture` also *buffers* stderr and returns it (`{ stdout, stderr, exitCode }`) — `green-check` puts it in the failure detail. The kit ships **`lif-studio`'s superset**; had the kit taken the byte-identical pair at face value, P4 would have silently dropped that failure detail. The `GitRunner`/`GhRunner` type annotations on `hostGit`/`ghCapture` stay repo-local, so the wrappers keep the plain signatures. The extra `stderr` field is additive for the other two consumers.
> - **Import specifiers.** Sources import `./x.mts` (unchanged from the donors — and the only form `node --experimental-strip-types` resolves when tests run off `src/`); `rewriteRelativeImportExtensions` rewrites them to `.mjs` in the JS emit. Declaration files keep `.mts`, which TS 7 resolves to the sibling `.d.mts` — verified by typechecking a scratch consumer against the built `dist/`, including that a deliberate mismatch still errors (types are real, not `any`).

**`presets/implement` — the issue-driven lifecycle. ✅ Done 2026-07-26.** The target-design table already placed `workflows/implement` in the kit as an opt-in preset; this builds it, from `comfyui-lif-nodes` per the base-implementation decision. Behaviour-preserving: the guards, trailer resume, plan-when-absent, checklist ralph loop, artifact strip, and PR create/refresh are unchanged.

> **Landed** as `src/presets/implement.mts` + `templates/implement/{plan,task,review}-prompt.md`. Suite is 61 tests green (was 46). Three things the port had to settle:
>
> - **The config seam.** The donor read `createAgent`, `createSandboxProvider`, and `preflightCommands` from its own `.sandcastle/config.mts` by relative import, and the first cut of this preset mechanically preserved that split as `ImplementConfig`. That was wrong: the donor's seam existed because `config.mts` was a *sibling file*, not a package boundary. Carrying it across the boundary pushed provider knowledge — `sandcastle.claudeCode` vs `sandcastle.codex`, and a `~/.codex/auth.json` heredoc — into every consumer's config. Corrected: `ImplementConfig` is now `conventions`, `verify`, and an optional `preflight`, with `createAgent`/`createSandboxProvider`/`templateDir` as optional escape hatches. `runImplementLoop(config)` is the consumer entrypoint; `main(options, deps)` keeps the donor's signature so the guard tests moved unchanged.
>
>   The tell was already in the tree: `forwardedEnvKeys` forwards `CODEX_AUTH_JSON` from inside the kit, while the shim that consumes it sat in the consumer. `lib/provider-setup.mts` now owns both halves — agent construction, credential materialization, and the CLI smoke check, all keyed off `profile.provider` and nothing else — with a test asserting every `$VAR` the preflight consumes is one `forwardedEnvKeys` sends. `CLAUDE_CREDENTIALS_JSON` joins the forwarded set, which is `Morrow`'s subscription-auth shim arriving early (P5 listed it) and makes the two providers symmetric.
> - **The templates were not repo-agnostic.** They named `uv run`, `pytest`, `pre-commit`, `web/js/`, and a specific source file. Those collapse to two injected args — `{{CONVENTIONS}}` (the toolchain block) and `{{VERIFY}}` (the canonical test command) — which is the "kit defaults + repo override + injected `CONVENTIONS`" row of the table. Two regression tests hold the line: every `{{ARG}}` in a shipped template must be in the preset's `promptArgs` for that phase (an unsupplied placeholder reaches the agent as literal `{{ARG}}`, which reads as a corrupted prompt rather than an error), and no shipped template may name a package manager or test runner.
> - **`isEntrypoint`.** The donor's `invokedDirectly` guard is generic, so it moved to `lib/entrypoint.mts`. It is what lets a consumer's `config.mts` be *both* the config module and the CLI entry — which is how acceptance criterion 7's "no `lib/` code" holds without the consumer also writing a `workflows/` shim.
>
> Not addressed: the base branch is still hardcoded `main` (`origin/main..`, `--base main`, and `main..HEAD` inside the review template). All three consumers use `main`, so this is deliberate rather than overlooked — but it is repo knowledge sitting in the kit, and a fourth consumer on `master` or `trunk` is the trigger to lift it into `ImplementConfig`.

**P2 — Cut `Morrow` over.** ~450 lines, no GitHub issue source, lowest blast radius. Blocked on `presets/task`, which does not exist; P3 now runs first. Writing `presets/task` is also the forcing function for the phase decomposition (see Architecture): `presets/implement` breaks into `src/phases/` and both presets become compositions, behaviour-preserving.

**P3 — Cut `comfyui-lif-nodes` over.** Its `config.mts` is already 36 lines of purely repo-specific configuration, so this is close to a straight deletion of `lib/`.

**P4 — Cut `lif-studio` over (requires P0).** `lif-studio` consumes the kit for the shared core; its one-consumer operational modules — swarm orchestrator, epic lane, green-check, run logging, usage tracking, phase deadlines — **stay repo-local**, per the junk-drawer rule (Risks). A module graduates into the kit only when a second repo actually adopts it, as its own kit release, not as part of this cutover.

**P5 — Backport the remaining divergence.** With one implementation in place, the fixes that never propagated land for everyone: trailer resume, per-phase profiles, `CODEX_AUTH_JSON` auth, and the `AGENT_NOTES.md` / `AGENT_SUMMARY.md` cross-session artifacts (`defangShellExpansion` already landed in P-pre/P1). Also forward-port `lif-studio`'s conditional GID alignment in the Dockerfile (`if [ -z "$(getent group …)" ]`), which the other two lack and which breaks on a macOS host GID of 20 — relevant if any of this ever runs on `peter-macmini`.

## Risks

- **The kit becomes a junk drawer.** Standing rule: nothing enters the kit until a *second* repo actually needs it. A one-consumer "shared" module is indirection, and it is how the fourth consumer becomes painful.
- **Extraction breaks an unattended pipeline silently.** Mitigated by phasing `Morrow` first and by tag pinning — a consumer that has not bumped is unaffected by kit churn.
- **Sandcastle upstream churn.** A `@ai-hero/sandcastle` major bump now requires a kit release plus N consumer bumps. This is the accepted cost; today it is N independent migrations with no shared test surface, which is worse.
- **`Morrow` cross-project coupling.** Placing the kit inside `lif-studio` would make a `strawcake1/` project depend on this monorepo. Weighed in Open decision D2.

## Acceptance criteria

1. `lif-sandcastle` builds to `dist/` with declarations and passes the migrated unit tests (`profiles`, `task-list`, `task-loop`, `host-exec`, preset entrypoints).
2. `Morrow/.sandcastle/` contains only `config.mts`, `Dockerfile`, `.env.example`, and any overridden templates; `lib/host-exec.mts` is deleted, and `npm run sandcastle-agent` completes a real run.
3. The same holds for `comfyui-lif-nodes`, including a green label-triggered AFK run end to end.
4. `lif-studio`'s `package.json` `typecheck` and `test:sandcastle-lib` scripts shrink to the modules that remain repo-local.
5. Every consumer pins a kit **tag**; no consumer references `#main`.
6. A `defangShellExpansion` regression test lives in the kit and is exercised by all three consumers' pipelines — and `lif-studio`'s pipeline carries the defence from P-pre onward, before the kit exists.
7. Adding a fourth repo requires writing `config.mts`, a `Dockerfile`, and optionally `.env.example` and template overrides — no `lib/` code.

## Open decisions

**D1 — Template distribution. Settled: (b) resolve via `templatePath()`.** The kit exports `templatePath(name, { workspaceRoot, overrideDir })`, returning a workspace-relative path into `node_modules`; a repo override under `overrideDir` wins when the same-named file exists. The rejected alternative was (a) *materialise* — a `sandcastle-kit sync` command copying defaults into `.sandcastle/templates/`. (b) wins on machinery: no CLI, no gitignored generated tree, no extra workflow step to forget. The accepted cost is that two things become load-bearing — `node_modules` must sit **inside** the mounted sandbox workspace, and install must run before the first template read. `templatePath` throws rather than returning an escaping path when the first does not hold, so the failure is loud at run start instead of a confusing `promptFile` miss mid-run.

**D2 — Repo location and visibility. Settled: standalone public [`alandy88/lif-sandcastle`](https://github.com/alandy88/lif-sandcastle).** Keeps `Morrow` free of a monorepo dependency, and public is what gives it *both* the reusable workflow and credential-free `npm i` (see the cross-owner caveat above) — standalone-private or in-monorepo would mean Morrow needs an `alandy88` token in its secrets and keeps its own workflow file. The `lif-datafiles` git-URL precedent (ADR-0024/0033/0034) still governs *how* it is consumed; only the location differs.

**D3 — First-cut scope. Settled: identical modules plus defang, nothing else.** The junk-drawer rule already answers this — run logging, usage tracking, and deadlines each have exactly one consumer today and stay in `lif-studio` until a second repo asks (see P4).

## Decision log hooks

- **ADR still owed, in this repo.** D1 and D2 are settled, so the ADR recording the module boundary rule and the tag-pinning requirement — the two constraints that keep the kit from re-accumulating repo-specific code — is now due. It binds all consumers, so it belongs here (`docs/adr/`), not in any one of them. Not yet written.
- ~~`AGENTS.md` gains `lif-sandcastle` under "Related repos (external, cloned separately)" if D2 lands standalone.~~ Done — D2 landed standalone.
