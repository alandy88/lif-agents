# `@lif/sandcastle-kit` reference

Everything a consumer might need after the README's Quick start: the full
config surface, what each preset expects of a repo, prompt customization, and
composing your own lifecycle out of the phases.

Design and phasing: [2026-07-26-sandcastle-kit-shared-package-prd.md](2026-07-26-sandcastle-kit-shared-package-prd.md).

## Adopting it in an existing repo

You add three small files:

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

Only one field is required. `isEntrypoint` lets one file be both the config
and the executable.

### 2. `.sandcastle/Dockerfile`

Each session runs in a container built from your image (named
`sandcastle:<repo-directory-name>` by default), with the repo worktree
bind-mounted as the project root. The image needs your toolchain plus the
provider CLIs (`claude`, `codex`) that your profiles shell out to. Build it
before the first run:

```bash
docker build -t sandcastle:my-repo -f .sandcastle/Dockerfile .
```

The kit reads its prompt templates directly from `node_modules`, so
`node_modules` must sit inside the mounted workspace and install must run
before the first template read. `templatePath()` checks this at run start.

### 3. Credentials

The host process needs credentials for the providers the run actually uses.
The kit forwards only those into the sandbox and writes the login blobs to the
paths each CLI expects.

| var | purpose |
|---|---|
| `GH_TOKEN` | always — issue reads/writes, branch push, PR |
| `CLAUDE_CODE_OAUTH_TOKEN` *or* `CLAUDE_CREDENTIALS_JSON` | Claude phases; the blob is the contents of `~/.claude/.credentials.json` from `claude login` |
| `OPENAI_API_KEY` *or* `CODEX_AUTH_JSON` | Codex phases; the blob is `~/.codex/auth.json` from `codex login` |

For local runs, put them in `.sandcastle/.env` (sandcastle reads it; commit
only `.env.example`). Under GitHub Actions, the implement preset writes a
key-name-only `.sandcastle/.env` itself after profile resolution, so values
never leave the Actions process environment.

### 4. CI wiring (issue-driven preset)

The `agent.yml` in this repo is `on: workflow_call`. Your repo keeps the
trigger and passes runner labels down:

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
    uses: alandy88/lif-agents/.github/workflows/agent.yml@v0.2.4
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

Note: cross-owner workflow reuse only works while this repo is public —
private reusable workflows do not cross owners.

## Config reference

Both presets take the same `RepoConfig`. Provider-specific behavior lives in
the kit; anything that depends on your package manager, test commands, or repo
layout stays in your config.

| field | required | what it is |
|---|---|---|
| `toolchain` | ✅ | `"python" \| "node" \| "dotnet"` — selects warm-up, test command, and the conventions block injected into every prompt |
| `extraConventions` | | extra checks the toolchain can't imply (a second test suite, a generated file). Appended after the standard block, never replacing it |
| `preflight` | | `() => string[]` — sandbox warm-up beyond the toolchain's, run after it and before provider auth |
| `templateDir` | | workspace-relative dir whose same-named files override the kit's prompts, e.g. `".sandcastle/templates"` |

### The toolchain standard

Picking a toolchain picks its whole command set. `python` means uv:

| | warm-up | test | conventions block |
|---|---|---|---|
| `python` | `uv sync` | `uv run python -m pytest` | + `uv run pre-commit run --all-files`, and the rule that Python tooling always goes through `uv run` |
| `node` | `npm ci` | `npm test` | + `npm run typecheck`, `npm run lint`, and npm-not-yarn/pnpm |
| `dotnet` | `dotnet restore` | `dotnet test` | + `dotnet build`, `dotnet format --verify-no-changes` |

There is deliberately no free-text `conventions` string — adding a toolchain
is a kit change with a test, and every consumer that picks it gets the same
commands.

### Model profiles

Per-phase routing, resolved once per run, in this order: `--profile` →
`agent:*` issue label → `AGENT_DEFAULT_PROFILE` → the mixed map.

| name | plan | task | review |
|---|---|---|---|
| `mixed` (default) | `claude-opus-5` | `gpt-5.6-sol` | `claude-opus-5` |
| `claude` | `claude-opus-5` for all three |||
| `gpt` | `gpt-5.6-sol` for all three |||

`--model <id>` overrides the model within a named profile. It is rejected
against `mixed` (which runs different models per phase) and validated against
the provider's id shape. Issue labels `agent:claude` / `agent:gpt` make the
same selection from the issue side. The ledger preset has no labels, so it
takes `--profile` / `--model` only.

### CLI flags

| preset | flags |
|---|---|
| `implement` | `--issue <n>` (required), `--profile`, `--model`, `--trigger` |
| `task` | `--iterations <1-20>` (default 1), `--task <label>` (pins the first iteration only), `--profile`, `--model` |

Unknown flags are a hard error, not a silent ignore.

## What each preset expects of the repo

### `presets/implement`

The issue is the source of truth. Guards run before anything is warmed:

- A closed issue is rejected.
- A `--trigger issues` run whose issue no longer carries `ready-for-agent` is
  skipped cleanly.
- An epic (native GitHub sub-issues) is rejected with a comment telling you to
  run the sub-issues individually.

If the issue body has no `## Tasks` checklist, the plan phase writes one into
the issue body itself and the host re-fetches it. More than 12 tasks stops the
run.

The run then executes one fresh agent session per unchecked task on
`agent/issue-<n>`. Each completed task gets an empty commit with a
`Task-Done: <n>` trailer, and the branch is pushed, so a re-fired run resumes
from the trailers instead of starting over. Two run artifacts live on the
branch: `AGENT_NOTES.md` (deviations, injected into every later session) and
`AGENT_SUMMARY.md` (the reviewer's PR body). The host strips both before
opening the PR, so they never reach main.

### `presets/task`

No issue source. `PLAN.md` is the plan and `STATE.md` is the newest-first
ledger. Each task session appends an entry ending in a recommendation line:

```markdown
Next task: **1.4 Nature kit data**
```

That line drives the loop and derives the branch
(`agent/1-4-nature-kit-data`). A ledger without it stops the run rather than
guessing.

Each iteration:

1. Syncs main fast-forward-only.
2. Delivers the task (retried once with a fresh context if it made no commits).
3. Runs a fresh-context verify that must emit `COMPLETE`.

On failure, the branch is pushed for inspection and no PR opens. On success, a
PR opens and is squash-merged.

## Customizing prompts

Point `templateDir` at a workspace-relative directory. Any same-named file in
it wins over the kit's default:

```ts
const config: ImplementConfig = {
  toolchain: "node",
  templateDir: ".sandcastle/templates",
};
```

```
.sandcastle/templates/implement/task-prompt.md   # overrides just this one
```

Defaults live in [../templates/](../templates/) and are read directly from
`node_modules`, never copied into your repo.

| template | phase | placeholders available |
|---|---|---|
| `implement/plan-prompt.md` | plan | `BRANCH`, `ISSUE_NUMBER`, `ISSUE_TITLE`, `ISSUE_BODY`, `CONVENTIONS` |
| `implement/task-prompt.md` | task | + `TASK_INDEX`, `TASK_COUNT`, `TASK_TEXT`, `TASK_LIST`, `NOTES` |
| `implement/review-prompt.md` | review | `BRANCH`, `ISSUE_NUMBER`, `ISSUE_TITLE`, `ISSUE_BODY`, `NOTES`, `CONVENTIONS` |
| `task/task-prompt.md` | task | `BRANCH`, `TASK_LABEL`, `CONVENTIONS`, `VERIFY` |
| `task/verify-prompt.md` | verify | `BRANCH`, `TASK_LABEL`, `CONVENTIONS`, `VERIFY` |

`{{BRANCH}}` always comes from the run context, and the phase defangs every
argument against shell expansion.

For a single extra check, prefer `extraConventions` — an overridden prompt is
a file you maintain against kit updates.

## Composing your own lifecycle

If neither preset fits, compose the phases directly — a preset is just a file
that does this:

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
assemble preflight (toolchain → your `preflight` → provider auth, in that
order), warm one sandbox, and hand back one `PhaseContext` per phase. The
handle is `await using`-disposable.

| phase | contract | default max iterations |
|---|---|---|
| `plan` | slices the work into a checklist, editing the source of truth itself | 2 |
| `task` | one fresh agent context delivering one unit of work; commit count is the landing signal | 5 |
| `review` | reads the whole change and produces a prose artifact | 1 |
| `verify` | binary gate — emits `COMPLETE` or the run stops | 3 |

There is no pipeline engine, DAG config, or plugin registry. The sandbox and
agent in `PhaseContext` are typed structurally, so composing phases never
drags `@ai-hero/sandcastle` into your typecheck.

Useful pieces exported from the root for hand-rolled loops: `templatePath`,
`renderConventions`, `toolchains`, `resolvePhases`, `describeRun`,
`forwardedEnvKeys`, `openRun`, `deliverPullRequest`, `githubIssueSource`,
`parseTaskList` / `checkOffTask` / `taskDoneTrailer`, `ensureTaskList`,
`push` / `pushCheckpoint` / `resumeFromOrigin` / `syncMain`, `defangPromptArgs`,
`isEntrypoint`.

## What the kit deliberately does not offer

There is no `createAgent` or `createSandboxProvider` hook — either would pull
`@ai-hero/sandcastle` types back into the consumer's typecheck. If a consumer
needs a different sandbox, the kit grows a declarative option
(`sandbox: { mounts: [...] }`) whose types it owns. A unit test enforces the
boundary.

The bar for any new module: if it can't be written without naming a package
manager, a test command, or a repo layout, it stays in the consuming repo. And
nothing enters the kit until a second repo actually needs it.
