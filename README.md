# lif-sandcastle

`@lif/sandcastle-kit` — the repo-agnostic engine behind the `.sandcastle/` agent
pipelines in `lif-studio`, `comfyui-lif-nodes`, and `Morrow`.

Design and phasing: [docs/2026-07-26-sandcastle-kit-shared-package-prd.md](docs/2026-07-26-sandcastle-kit-shared-package-prd.md).

**Status: P1 landed, plus `presets/implement`.** `host-exec`, `task-list`,
`task-loop`, `profiles`, `github-issue`, `defang`, and `templatePath` are here
with their tests, and the issue-driven lifecycle from `comfyui-lif-nodes` now
ships as `presets/implement` with its default prompt templates. No consumer has
cut over yet. `presets/task` (the `Morrow` ledger lifecycle) is not written.

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

That is the whole interface — one required field, no imports beyond the kit.

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

## Why `dist/` is committed

Git-URL consumers install without a registry. `npm` runs `prepare` for git
dependencies, but the runner images use `bun install`, whose `prepare` handling
for git deps is not something the pipeline should depend on. Committing `dist/`
makes the install work identically under both. CI fails if the committed output
drifts from source.

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
