# Sandcastle Kit — Shared Agent-Orchestration Package

**Status:** Accepted (2026-07-26). D1–D3 settled. This repo is public and CI green. **P-pre done** (2026-07-26, in `lif-studio`). **P1 done** (2026-07-26) — the core is extracted here with its tests; no consumer has cut over. **P2 (`Morrow`) is next**, with P0 runnable in parallel.

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
  src/presets/*.mts     implement (GitHub issues), task (local state)
  templates/*.md        default prompts
  dist/                 tsc output — .mjs + .d.mts (committed; see below)
  .github/workflows/agent.yml   on: workflow_call
```

**`@ai-hero/sandcastle` is a peerDependency of the kit**, with an explicit version range (initially `^0.12`). Consumers keep pinning sandcastle themselves; the peer range makes the kit's API assumption installable-checkable instead of implicit. Without this, the version skew of problem 3 reappears one level down. A sandcastle major bump is then, by construction, a kit release plus N consumer bumps.

**Build to `dist/`; do not ship raw `.mts`.** All three consumers run TypeScript directly today (tsx or bun), which makes shipping sources tempting — but `.mts` inside `node_modules` is exactly where tsx/bun dependency-transpilation behaviour is inconsistent. `tsc` with declarations is cheap now that the repos are on TS 7.

Two details the scaffold settled:

- **Output is `.mjs`, not `.js`.** `.mts` sources under `module: nodenext` emit `.mjs`. Sources stay `.mts` so P1 modules move over unchanged, and the exports map follows the emit rather than the other way round.
- **`dist/` is committed, not built on install.** Git-URL consumers install without a registry; `npm` runs `prepare` for git deps, but the runners use `bun install`, whose `prepare`-on-git-dep handling is not something an unattended pipeline should rest on. Committing the output makes both installers behave identically. Kit CI runs `git diff --exit-code -- dist` so a stale commit fails loudly. (Also noted for P1: TS 7 does not auto-include `@types/*` — `"types": ["node"]` is required for node builtins.)

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
// .sandcastle/config.mts — the only file a consumer writes
import { runImplementLoop } from "@lif/sandcastle-kit/presets/implement";

export default {
  preflight: () => ["uv sync"],       // repo toolchain
  verify: "uv run pytest",            // repo test command
  conventions: "…",                   // injected into prompt templates
  templateDir: ".sandcastle/templates", // optional override
};
```

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

## Phasing

**P-pre — Backport `defangShellExpansion` immediately, outside the extraction. ✅ Done 2026-07-26.** Cherry-pick the defence into `lif-studio`'s issue-driven pipeline (and `Morrow`'s if its prompt inputs are ever attacker-writable) *now*, as plain copies. A third copy for a few weeks is acceptable; an unattended pipeline substituting undefanged issue bodies for the duration of a multi-phase extraction is not. The kit's regression test (acceptance criterion 6) is the durable fix; this is the stopgap. Nothing else in the plan depends on it and nothing blocks it.

> **Landed:** `lif-studio/.sandcastle/lib/defang.mts` + `defang.test.mts` (verbatim copy of the `comfyui-lif-nodes` inline pair), applied at the two `promptArgs` construction sites — `lib/run-session.mts` (the live vector: implement+review share one args map, and `templates/implement/review-prompt.md` is the one template that expands `` !`…` `` after arg substitution) and `lib/run-retro.mts`. Registered in the `typecheck` and `test:sandcastle-lib` scripts; suite green at 208 tests. `Morrow` needs no backport — it has no issue source and no template in `.sandcastle/` uses `` !` `` expansion. The `templates/agent-spike/` scaffold was left alone: it is not the production pipeline and uses no expansion. P1 replaces this copy with the kit module.

**P0 — Version unification (blocks P4 only).** Bring `lif-studio` from `@ai-hero/sandcastle@^0.10` to `^0.12`, matching the other two. The kit's base (`comfyui-lif-nodes`) is already on `^0.12`, so P1–P3 do not need this — only `lif-studio`'s own cutover does. P0 is plausibly the most expensive single step (~8,300 lines across two sandcastle minors); run it in parallel with P1–P3 rather than in front of them.

**P1 — Extract the identical core. ✅ Done 2026-07-26.** Move `host-exec`, `task-list`, `task-loop`, `profiles`, `github-issue` into the kit with their tests, plus `defangShellExpansion` extracted out of `workflows/implement/main.mts` into a kit module with its regression test. Behaviour-preserving; no consumer changes yet.

> **Landed** in `src/lib/` (from `comfyui-lif-nodes`, per the base-implementation decision), re-exported from `src/index.mts`, built to `dist/`. Suite is 46 tests green: `profiles`, `task-list`, `task-loop`, and `templates` as migrated, plus `host-exec` and `defang` tests taken from `lif-studio` (`comfyui-lif-nodes` had none for either — its defang tests lived inside `workflows/implement/main.test.mts`).
>
> Two things the move corrected, both worth carrying into the consumer cutovers:
>
> - **`host-exec` was *not* three copies of one file.** Problem statement 1 is right that `Morrow` and `comfyui-lif-nodes` are byte-identical, but `lif-studio`'s `capture` also *buffers* stderr and returns it (`{ stdout, stderr, exitCode }`) — `green-check` puts it in the failure detail. The kit ships **`lif-studio`'s superset**; had the kit taken the byte-identical pair at face value, P4 would have silently dropped that failure detail. The `GitRunner`/`GhRunner` type annotations on `hostGit`/`ghCapture` stay repo-local, so the wrappers keep the plain signatures. The extra `stderr` field is additive for the other two consumers.
> - **Import specifiers.** Sources import `./x.mts` (unchanged from the donors — and the only form `node --experimental-strip-types` resolves when tests run off `src/`); `rewriteRelativeImportExtensions` rewrites them to `.mjs` in the JS emit. Declaration files keep `.mts`, which TS 7 resolves to the sibling `.d.mts` — verified by typechecking a scratch consumer against the built `dist/`, including that a deliberate mismatch still errors (types are real, not `any`).

**P2 — Cut `Morrow` over.** ~450 lines, no GitHub issue source, lowest blast radius — the canary that proves the contract without risking the issue-driven pipelines.

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
