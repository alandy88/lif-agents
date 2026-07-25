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
import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import {
  isEntrypoint,
  runImplementLoop,
  type ImplementConfig,
} from "@lif/sandcastle-kit/presets/implement";

const config: ImplementConfig = {
  createAgent: (profile) =>
    profile.provider === "claude"
      ? sandcastle.claudeCode(profile.model, { effort: profile.effort })
      : sandcastle.codex(profile.model, { effort: profile.effort }),
  createSandboxProvider: () => docker(),
  preflightCommands: () => ["uv sync"],
  conventions: "- Python: `uv run python -m pytest tests/`\n- Lint: `uv run pre-commit run --all-files`",
  verify: "uv run python -m pytest tests/",
  templateDir: ".sandcastle/templates", // optional; kit defaults win when absent
};

export default config;

if (isEntrypoint(import.meta.url)) await runImplementLoop(config);
```

`conventions` and `verify` are the only repo knowledge the default prompts carry
— a unit test asserts the shipped templates name no package manager or test
runner of their own.

**Pin a tag, never `#main`.** AFK runs fire unattended; a kit change must not
reach a repo's next run without an explicit bump.

`@ai-hero/sandcastle` is a **peerDependency** (`^0.12`). Consumers keep pinning
sandcastle themselves; the peer range makes the kit's API assumption
installable-checkable rather than implicit.

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
