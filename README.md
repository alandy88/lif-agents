# lif-sandcastle

`@lif/sandcastle-kit` — the repo-agnostic engine behind the `.sandcastle/` agent
pipelines in `lif-studio`, `comfyui-lif-nodes`, and `Morrow`.

Design and phasing: `lif-studio/docs/superpowers/specs/2026-07-26-sandcastle-kit-shared-package-prd.md`.

**Status: scaffold.** Only `templatePath()` exists. P1 moves `host-exec`,
`task-list`, `task-loop`, `profiles`, `github-issue`, and `defangShellExpansion`
in from `comfyui-lif-nodes` with their tests.

## Consuming

```bash
npm i -D github:alandy88/lif-sandcastle#v0.1.0
```

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

## Reusable workflow

`.github/workflows/agent.yml` (`on: workflow_call`) is the other half of "define
once". Consumers keep the trigger and pass runner labels and issue number down.
This only resolves for `strawcake1/Morrow` while this repo is **public** —
private reusable workflows do not cross owners.
