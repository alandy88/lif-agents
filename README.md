# lif-sandcastle

`@lif/sandcastle-kit` — the repo-agnostic engine behind `.sandcastle/` agent
pipelines. A repo adopts an autonomous agent lifecycle by writing **one config
file** and a **Dockerfile**; the kit owns the loop, the prompts, the model
routing, the branch/PR mechanics, and provider authentication.

Two lifecycles ship:

| preset | source of work | run shape |
|---|---|---|
| `presets/implement` | a GitHub issue with a `## Tasks` checklist | plan → one fresh agent session per task → review → PR |
| `presets/task` | `PLAN.md` + a `STATE.md` ledger | next task → task session → fresh-context verify → PR → squash-merge, ×N |

Design and phasing: [docs/2026-07-26-sandcastle-kit-shared-package-prd.md](docs/2026-07-26-sandcastle-kit-shared-package-prd.md).

---

## Install

```bash
npm i -D github:alandy88/lif-sandcastle#v0.2.4
```

**Pin a tag, never `#main`.** AFK runs fire unattended, so a kit change must not
reach a repo's next run without an explicit bump — and `#main` is not installable
anyway (no `dist/`; see [Releases](#releases)).

That is the only pin. `@ai-hero/sandcastle` is a regular **dependency** of the
kit, not a peer: a consumer never installs it, never names it in
`package.json`, and never imports it.

Requires Node ≥ 22 and a Docker daemon on the machine that runs the pipeline.

## Adopting it in an existing repo

Three files, none of them big:

```
.sandcastle/
  config.mts        # config AND CLI entrypoint
  Dockerfile        # the sandbox image — yours, because toolchains differ
  .env.example      # documents the credentials a local run needs
.github/workflows/
  sandcastle-agent.yml   # only for the issue-driven preset
```

### 1. `.sandcastle/config.mts`

Issue-driven — `npx tsx .sandcastle/config.mts --issue 42 --trigger issues`:

```ts
import {
  isEntrypoint,
  runImplementLoop,
  type ImplementConfig,
} from "@lif/sandcastle-kit/presets/implement";

const config: ImplementConfig = { toolchain: "python" };

export default config;

if (isEntrypoint(import.meta.url)) await runImplementLoop(config);
```

Ledger-driven — `npx tsx .sandcastle/config.mts --iterations 3`:

```ts
import { isEntrypoint, runTaskLoop, type TaskConfig } from "@lif/sandcastle-kit/presets/task";

const config: TaskConfig = { toolchain: "dotnet" };

export default config;

if (isEntrypoint(import.meta.url)) await runTaskLoop(config);
```

One required field. `isEntrypoint` is what lets the same file be both the
imported config object and the executable — no second `main.mts`.

### 2. `.sandcastle/Dockerfile`

Sandcastle runs each session in a container built from **your** image, named
`sandcastle:<repo-directory-name>` by default, with the repo worktree
bind-mounted as the project root. The image needs your toolchain plus the
provider CLIs (`claude`, `codex`) the profiles you use will shell out to. Build
it before the first run:

```bash
docker build -t sandcastle:my-repo -f .sandcastle/Dockerfile .
```

Two things are load-bearing because the kit reads its prompt templates in place
from `node_modules`: **`node_modules` must sit inside the mounted workspace**,
and **install must have run before the first template read**. `templatePath()`
throws loudly at run start if the first does not hold, rather than failing
mid-run on a missing `promptFile`.

### 3. Credentials

The host process needs the credentials for the providers the run actually uses;
the kit forwards only those into the sandbox and materializes the login blobs
back to the paths each CLI expects.

| var | purpose |
|---|---|
| `GH_TOKEN` | always — issue reads/writes, branch push, PR |
| `CLAUDE_CODE_OAUTH_TOKEN` *or* `CLAUDE_CREDENTIALS_JSON` | Claude phases; the blob is the contents of `~/.claude/.credentials.json` from `claude login` |
| `OPENAI_API_KEY` *or* `CODEX_AUTH_JSON` | Codex phases; the blob is `~/.codex/auth.json` from `codex login` |

Locally, put them in `.sandcastle/.env` (sandcastle reads it; commit only
`.env.example`). Under GitHub Actions the implement preset writes the
key-name-only `.sandcastle/.env` itself, after profile resolution, so values
never leave the Actions process environment.

### 4. CI wiring (issue-driven preset)

`.github/workflows/agent.yml` here is `on: workflow_call` — the consumer keeps
the trigger and passes runner labels down:

```yaml
name: sandcastle-agent
on:
  issues:
    types: [labeled]
  workflow_dispatch:
    inputs:
      issue: { required: true, type: string }
      profile: { required: false, type: string, default: default }
      model: { required: false, type: string, default: "" }

jobs:
  agent:
    if: github.event_name == 'workflow_dispatch' || github.event.label.name == 'ready-for-agent'
    uses: alandy88/lif-sandcastle/.github/workflows/agent.yml@v0.2.4
    with:
      issue: ${{ inputs.issue || github.event.issue.number }}
      runs-on: '["self-hosted","peter-3090-u","agent"]'
      entrypoint: .sandcastle/config.mts
      profile: ${{ inputs.profile || 'default' }}
      model: ${{ inputs.model || '' }}
      trigger: ${{ github.event_name }}
    secrets: inherit
```

Other inputs: `install-command` (default `bun install`), `runtime` (default
`bun`), `default-profile` (default `mixed`). Secrets: `AGENT_PAT` (push and PRs
as a PAT so CI actually triggers), `CLAUDE_CODE_OAUTH_TOKEN`, `OPENAI_API_KEY`,
`CODEX_AUTH_JSON`.

Cross-owner reuse only resolves while this repo is **public** — private
reusable workflows do not cross owners.

## Config reference

Both presets take the same `RepoConfig`. Everything keyed off the provider is
the kit's; what is left cannot be written without naming your package manager.

| field | required | what it is |
|---|---|---|
| `toolchain` | ✅ | `"python" \| "node" \| "dotnet"` — selects warm-up, test command, and the conventions block injected into every prompt |
| `extraConventions` | | checks the toolchain name cannot imply (a second test suite, a generated file). Appended **under** the standard block, not instead of it |
| `preflight` | | `() => string[]` — sandbox warm-up beyond the toolchain's, run after it and before provider auth |
| `templateDir` | | workspace-relative dir whose same-named files override the kit's prompts, e.g. `".sandcastle/templates"` |

### The toolchain standard

`toolchain` is a choice, not a description. Picking `python` **is** picking uv:

| | warm-up | test | conventions block |
|---|---|---|---|
| `python` | `uv sync` | `uv run python -m pytest` | + `uv run pre-commit run --all-files`, and the rule that Python tooling always goes through `uv run` |
| `node` | `npm ci` | `npm test` | + `npm run typecheck`, `npm run lint`, and npm-not-yarn/pnpm |
| `dotnet` | `dotnet restore` | `dotnet test` | + `dotnet build`, `dotnet format --verify-no-changes` |

A free-text `conventions` string was the earlier design and it was wrong: it let
three repos invent three dialects of the same toolchain, and the one that told an
agent to run bare `pytest` would fail only at runtime, inside an unattended
sandbox, as a confusing import error. Adding a toolchain is a kit change with a
test, reviewed once, and every consumer that picks it gets the same commands.

### Model profiles

Per-phase routing, resolved once per run in this order: `--profile` →
`agent:*` issue label → `AGENT_DEFAULT_PROFILE` → the mixed map.

| name | plan | task | review |
|---|---|---|---|
| `mixed` (default) | `claude-opus-5` | `gpt-5.6-sol` | `claude-opus-5` |
| `claude` | `claude-opus-5` for all three |||
| `gpt` | `gpt-5.6-sol` for all three |||

`--model <id>` overrides the model *within* a named profile (it is rejected
against `mixed`, which runs different models per phase, and validated against
the provider's id shape). Issue labels `agent:claude` / `agent:gpt` do the same
selection from the issue side; the ledger preset has no labels, so it takes
`--profile` / `--model` only.

### CLI flags

| preset | flags |
|---|---|
| `implement` | `--issue <n>` (required), `--profile`, `--model`, `--trigger` |
| `task` | `--iterations <1-20>` (default 1), `--task <label>` (pins the first iteration only), `--profile`, `--model` |

Unknown flags are a hard error, not a silent ignore.

## What each preset expects of the repo

### `presets/implement`

The issue is the source of truth. Guards run before anything is warmed: a closed
issue is rejected; a `--trigger issues` run whose issue no longer carries
`ready-for-agent` is skipped cleanly; an epic (native GitHub sub-issues) is
rejected with a comment telling you to run the sub-issues individually.

If the issue body has no `## Tasks` checklist, the plan phase writes one **into
the issue body itself** and the host re-fetches it. More than 12 tasks stops the
run — that is a mis-scoped issue, not a plan.

Then one fresh agent session per unchecked task, on `agent/issue-<n>`. Each
completed task gets an empty commit carrying a `Task-Done: <n>` trailer and the
branch is pushed, so a re-fired run resumes from the trailers instead of
rebuilding. Two run artifacts live on the branch — `AGENT_NOTES.md` (deviations,
injected into every later session so context does not reset) and
`AGENT_SUMMARY.md` (the reviewer's PR body) — and the host strips both before
the PR, so a forgetful reviewer cannot leak them onto main.

### `presets/task`

No issue source. `PLAN.md` is the plan and `STATE.md` is the newest-first
ledger; each task session appends an entry ending in a recommendation line:

```markdown
Next task: **1.4 Nature kit data**
```

That line drives the loop and derives the branch (`agent/1-4-nature-kit-data`).
A ledger with no such line stops the run rather than guessing. Each iteration
syncs main fast-forward-only, delivers the task (retried once with a fresh
context if it made no commits), then runs a fresh-context verify that must emit
`COMPLETE`. Failure pushes the branch for inspection and opens no PR; success
opens a PR and squash-merges it.

## Customizing prompts

Point `templateDir` at a workspace-relative directory and any same-named file
wins over the kit's default:

```ts
const config: ImplementConfig = {
  toolchain: "node",
  templateDir: ".sandcastle/templates",
};
```

```
.sandcastle/templates/implement/task-prompt.md   # overrides just this one
```

Defaults live in [templates/](templates/) and are resolved in place from
`node_modules` — they are never copied into your repo, so an override is always
a deliberate, visible file.

| template | phase | placeholders available |
|---|---|---|
| `implement/plan-prompt.md` | plan | `BRANCH`, `ISSUE_NUMBER`, `ISSUE_TITLE`, `ISSUE_BODY`, `CONVENTIONS` |
| `implement/task-prompt.md` | task | + `TASK_INDEX`, `TASK_COUNT`, `TASK_TEXT`, `TASK_LIST`, `NOTES` |
| `implement/review-prompt.md` | review | `BRANCH`, `ISSUE_NUMBER`, `ISSUE_TITLE`, `ISSUE_BODY`, `NOTES`, `CONVENTIONS` |
| `task/task-prompt.md` | task | `BRANCH`, `TASK_LABEL`, `CONVENTIONS`, `VERIFY` |
| `task/verify-prompt.md` | verify | `BRANCH`, `TASK_LABEL`, `CONVENTIONS`, `VERIFY` |

`{{BRANCH}}` always comes from the run context, and every argument is defanged
against shell expansion by the phase — neither is something a template author or
call site can forget.

Prefer `extraConventions` over forking a template when all you want is one more
check; an overridden prompt is a file you now maintain against kit updates.

## Composing your own lifecycle

If neither preset fits, compose the phases directly — that is the supported
extension point, and a preset is nothing more than a file that does this.

```ts
import { openRun, resolvePhases, type RepoConfig } from "@lif/sandcastle-kit";
import { runTaskPhase } from "@lif/sandcastle-kit/phases/task";
import { runReviewPhase } from "@lif/sandcastle-kit/phases/review";

const config: RepoConfig = { toolchain: "node" };
const run = resolvePhases({ dispatchProfile: "claude" });
await using opened = await openRun({ config, run, branch: "agent/spike" });

const task = await runTaskPhase(opened.ctx.task, {
  args: { TASK_LABEL: "Port the loader", CONVENTIONS: "...", VERIFY: "npm test" },
  name: "task-spike",
  template: "task/task-prompt.md",
});
if (task.commits === 0) throw new Error("no commits");

await runReviewPhase(opened.ctx.review, { args: { ... }, name: "review-spike" });
```

`openRun` is the scaffold both presets share: resume the branch from origin,
assemble preflight (toolchain → your `preflight` → provider auth, in that order),
warm one sandbox, and hand back one `PhaseContext` per phase. The handle is
`await using`-disposable.

| phase | contract | default max iterations |
|---|---|---|
| `plan` | slices the work into a checklist, editing the source of truth itself | 2 |
| `task` | ONE fresh agent context delivering ONE unit of work; commit count is the landing signal | 5 |
| `review` | artifact-producing — reads the whole change and leaves prose behind | 1 |
| `verify` | binary gate — `COMPLETE` or the run stops | 3 |

**No pipeline engine, no DAG config format, no plugin registry.** The sandbox and
agent in `PhaseContext` are typed *structurally*, so composing phases never drags
`@ai-hero/sandcastle` into your typecheck (and lets a test inject a fake sandbox).

Useful pieces exported from the root for hand-rolled loops: `templatePath`,
`renderConventions`, `toolchains`, `resolvePhases`, `describeRun`,
`forwardedEnvKeys`, `openRun`, `deliverPullRequest`, `githubIssueSource`,
`parseTaskList` / `checkOffTask` / `taskDoneTrailer`, `ensureTaskList`,
`push` / `pushCheckpoint` / `resumeFromOrigin` / `syncMain`, `defangPromptArgs`,
`isEntrypoint`.

## What the kit deliberately does not offer

No `createAgent` or `createSandboxProvider` hook. Either would be typed as a
sandcastle object and so would drag `@ai-hero/sandcastle` back into the
consumer's imports and typecheck — the exact leak this boundary exists to close.
When a consumer genuinely needs a different sandbox, the kit grows a
*declarative* option (`sandbox: { mounts: [...] }`) whose types it owns, not a
function returning somebody else's. A unit test asserts both halves: no
`@ai-hero` type reaches a preset's public declaration, and the manifest declares
no peer range.

The test for any new module: *if it cannot be written without naming a package
manager, a test command, or a repo layout, it stays in the consuming repo.*
Standing rule: **nothing enters the kit until a second repo actually needs it.**

## Releases

`dist/` is gitignored on `main` and force-added onto each `vX.Y.Z` tag commit, so
git-URL installs get built output whether the runner uses `npm` or `bun`, while
`main` stays clean. `package.json` on `main` reads `0.0.0-development` and is
never bumped — only the release commit carries a real version, stamped next to
the `dist/` it describes. **To read what is current, read the tags.**

Releases cut themselves: every push to `main` builds, and a new tag follows if
the installable payload differs from the last tag's (`scripts/release-gate.mts`).
The gate is the built output, not the commit subject — a "chore: bump routing
model ids" commit changes the model every consumer resolves and would ship
nothing under a subject filter. Commit type only picks the bump size: `feat` or
`!` takes the minor, anything else the patch (below 1.0.0 a breaking change is a
minor). A `workflow_dispatch` with an explicit `version` overrides both.

Raw `.mts` is deliberately not shipped — `.mts` inside `node_modules` is exactly
where tsx/bun dependency-transpilation behaviour is inconsistent. Sources import
each other by `.mts` (the only specifier `node --experimental-strip-types`
resolves when the tests run off `src/`); the JS emit rewrites those to `.mjs`,
while declarations keep `.mts` and resolve to the sibling `.d.mts`, so a consumer
typechecking against `dist/` sees real types, not `any`.

## Developing the kit

```bash
npm test           # unit tests, node --experimental-strip-types off src/
npm run typecheck
npm run build
```
