# lif-sandcastle

`@lif/sandcastle-kit` — the repo-agnostic engine behind the `.sandcastle/` agent
pipelines in `lif-studio`, `comfyui-lif-nodes`, and `Morrow`.

Design and phasing: [docs/2026-07-26-sandcastle-kit-shared-package-prd.md](docs/2026-07-26-sandcastle-kit-shared-package-prd.md).

**Status: P1 landed, plus both presets and the phase layer.** `host-exec`,
`task-list`, `task-loop`, `profiles`, `github-issue`, `defang`, and
`templatePath` are here with their tests. The lifecycle stages live in
`src/phases/` (`plan`, `task`, `review`, `verify`, `deliver`), and the two
shipped lifecycles are compositions of them: `presets/implement` (the
issue-driven loop from `comfyui-lif-nodes`) and `presets/task` (the `STATE.md`
ledger loop from `Morrow`). No consumer has cut over yet.

## Consuming

```bash
npm i -D github:alandy88/lif-sandcastle#v0.1.0
```

An issue-driven consumer's `.sandcastle/config.mts` is both the config and the
CLI entrypoint — `npx tsx .sandcastle/config.mts --issue 42 --trigger issues`:

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

A ledger-driven consumer (no GitHub issue source; `PLAN.md` is the plan and
`STATE.md` the progress ledger) picks the other preset instead —
`npx tsx .sandcastle/config.mts --iterations 3`:

```ts
import { isEntrypoint, runTaskLoop, type TaskConfig } from "@lif/sandcastle-kit/presets/task";

const config: TaskConfig = { toolchain: "dotnet" };

export default config;

if (isEntrypoint(import.meta.url)) await runTaskLoop(config);
```

That is the whole interface — one required field, no imports beyond the kit.

## Phases

A lifecycle's stages are the unit of reuse, not whole lifecycles. Each phase in
`src/phases/` is an async function taking a `PhaseContext` (sandbox, branch,
per-phase agent, template resolver) plus typed inputs, returning a typed result,
and paired with a default prompt template:

| phase | contract |
|---|---|
| `plan` | slices the work into a checklist, editing the source of truth itself |
| `task` | ONE fresh agent context delivering ONE unit of work; commit count is the landing signal |
| `review` | artifact-producing — reads the whole change and leaves prose behind |
| `verify` | binary gate — `COMPLETE` or the run stops |
| `deliver` | host-side `git`/`gh`: open the PR, optionally squash-merge it |

Composition is plain TypeScript. **No pipeline engine, no DAG config format, no
plugin registry** — a preset is a thin file calling phase functions in order, and
a consumer that wants mix-and-match (`lif-studio`'s swarm lanes) writes exactly
what a preset writes internally.

Two things are baked into the phases rather than into the presets, so no call
site can forget them: every prompt argument is defanged, and `{{BRANCH}}` comes
from the context. The `PhaseContext` sandbox and agent are typed *structurally*
by the kit — naming sandcastle's types there would leak the dependency into a
consumer composing phases, and the boundary test covers `phases/` for that
reason.

## The toolchain standard

`toolchain` is a choice, not a description. Picking `python` **is** picking uv;
the kit owns what follows from it:

| | warm-up | test | conventions block |
|---|---|---|---|
| `python` | `uv sync` | `uv run python -m pytest` | + `uv run pre-commit run --all-files`, and the rule that Python tooling always goes through `uv run` |
| `node` | `npm ci` | `npm test` | + `npm run typecheck`, `npm run lint`, and npm-not-yarn/pnpm |
| `dotnet` | `dotnet restore` | `dotnet test` | + `dotnet build`, `dotnet format` |

A free-text `conventions` string was the earlier design and it was wrong: it let
three repos invent three dialects of the same toolchain, and the one that told
an agent to run bare `pytest` instead of `uv run pytest` would fail only at
runtime, inside an unattended sandbox, as a confusing import error. Adding a
toolchain is a kit change with a test, reviewed once, and every consumer that
picks it gets the same commands.

The remaining options are all additive, never replacements:

- `extraConventions` — checks the toolchain name cannot imply, like a second
  test suite at repo-specific paths. Appended under the standard block.
- `preflight` — sandbox warm-up beyond the toolchain's, like a generated-file
  step. Appended after it.
- `templateDir` — a workspace-relative directory whose same-named files win over
  the kit's default prompts.

Deliberately **not** offered: a `createAgent` or `createSandboxProvider` hook.
Either one would be typed as a sandcastle object and so would drag
`@ai-hero/sandcastle` back into the consumer's imports and typecheck — the exact
leak this boundary exists to close. When a consumer genuinely needs a different
sandbox, the kit grows a *declarative* option (`sandbox: { mounts: [...] }`)
whose types it owns, not a function returning somebody else's.

### Provider authentication

Each provider CLI authenticates two ways: a bare token the CLI reads itself
(`CLAUDE_CODE_OAUTH_TOKEN`, `OPENAI_API_KEY`), or the credentials blob
`<cli> login` writes to disk, forwarded as `CLAUDE_CREDENTIALS_JSON` /
`CODEX_AUTH_JSON`. `providerPreflight` materializes the blob back to the path
the CLI expects, guarded so the API-key path is a no-op rather than an error.

`forwardedEnvKeys` and `providerPreflight` are two halves of one contract — a
unit test asserts every `$VAR` the preflight consumes is one the kit forwards.
They were split across the package boundary before, which is precisely the leak
that put a `~/.codex/auth.json` heredoc in a consumer's config file.

**Pin a tag, never `#main`.** AFK runs fire unattended; a kit change must not
reach a repo's next run without an explicit bump.

**That is the only pin a consumer has.** `@ai-hero/sandcastle` is a regular
**dependency** of the kit, not a peer — a consumer never installs it, never
names it in `package.json`, and never imports it. The kit is the abstraction;
sandcastle is its implementation detail. A unit test asserts both halves: no
`@ai-hero` type reaches a preset's public declaration, and the manifest declares
no peer range.

## Module boundary

The test for any module: *if it cannot be written without naming a package
manager, a test command, or a repo layout, it stays in the repo.*

Standing rule: **nothing enters the kit until a second repo actually needs it.**
A one-consumer "shared" module is indirection.

## Templates

Defaults live in `templates/` and are read in place from `node_modules`
(PRD decision D1(b)):

```ts
import { templatePath } from "@lif/sandcastle-kit";

const promptFile = templatePath("implement/task-prompt.md", {
  overrideDir: ".sandcastle/templates",
});
```

The returned path is workspace-relative, as sandcastle's `promptFile` requires.
Two consequences are load-bearing: `node_modules` must sit **inside** the mounted
sandbox workspace, and install must have run before the first template read.

## Why `dist/` ships in release tags

Git-URL consumers install without a registry. `npm` runs `prepare` for git
dependencies, but the runner images use `bun install`, whose `prepare` handling
for git deps is not something the pipeline should depend on. So the built
output must be in the git tree consumers install — but it does not belong in
`main`'s history. `dist/` is gitignored on `main`; the release workflow
(`.github/workflows/release.yml`) builds, tests, and cuts each `vX.Y.Z` tag
from a commit that force-adds `dist/`. That commit lives only behind the tag
ref, so both installers see identical built output while `main` stays clean.

A consequence worth stating: **`#main` is not installable** — it has no
`dist/`. That is aligned with the standing rule that consumers pin a tag and
never `#main`; the packaging now enforces what was previously only policy.

Raw `.mts` is deliberately not shipped: `.mts` inside `node_modules` is exactly
where tsx/bun dependency-transpilation behaviour is inconsistent.

Sources import each other by `.mts` — unchanged from the donor repos, and the
only specifier `node --experimental-strip-types` resolves when the tests run off
`src/`. `rewriteRelativeImportExtensions` turns those into `.mjs` in the JS emit.
Declaration files keep the `.mts` specifier, which TS 7 resolves to the sibling
`.d.mts`; a consumer typechecking against `dist/` sees real types, not `any`.

## Reusable workflow

`.github/workflows/agent.yml` (`on: workflow_call`) is the other half of "define
once". Consumers keep the trigger and pass runner labels and issue number down.
This only resolves for `strawcake1/Morrow` while this repo is **public** —
private reusable workflows do not cross owners.
