# lif-agents

Configurations for using AI Coding Agents

Two sets:

1. **`local/`** — configuration for personal machines, Mac or
   Windows PCs.
2. **`remote/`** — configuration for remote environments: cloud VMs and build
   agents, running under the Sandcastle framework
   (`@lif/sandcastle-kit`).

## Local machines

### Setup

```bash
git clone https://github.com/alandy88/lif-agents
cd lif-agents
local/install/install.sh --env <name> --dry-run   # preview
local/install/install.sh --env <name>             # install
```

On Windows, run `local\install\install.ps1` instead (`-WhatIf` to preview).
Later runs need no `--env`; the installer reuses the environment recorded by the
last run on that machine. `<name>` is a directory under `local/environments/`.

The installer is idempotent — re-run it after a `git pull`.

### What it installs

It installs no software. WezTerm, Starship, Herdr, the Nerd Font and the agent
CLIs must already be present. The configurations use the destinations below.
On Windows, `install.ps1` redirects environment variables rather than
symlinking; `install.sh` symlinks.

| Config | Windows | macOS / WSL |
|---|---|---|
| `local/wezterm/wezterm.lua` | `WEZTERM_CONFIG_FILE` env var | `$XDG_CONFIG_HOME/wezterm/wezterm.lua` |
| `local/starship/starship.toml` | `STARSHIP_CONFIG` env var | `$XDG_CONFIG_HOME/starship.toml` |
| `local/herdr/config.toml` | [manual setup](local/environments/windows-5090/README.md#herdr), rendered to `%APPDATA%\herdr\config.toml` | rendered to `$XDG_CONFIG_HOME/herdr/config.toml` |
| `local/pwsh/profile.ps1` | dot-sourced from `$PROFILE` | — |
| `local/zsh/profile.zsh` | — | `~/.config/lif-shell.zsh`, sourced from `~/.zshrc` |
| `local/pi/extensions/pi-status-footer.ts` | see [local/README.md](local/README.md#layout) | see [local/README.md](local/README.md#layout) |

Machine-specific values live in a named environment under
`local/environments/`, applied through overlay files the configs read from fixed
paths.

Prerequisites, the values the installer must be given rather than guess, and the
post-install verification steps are in
[local/install/AGENTS.md](local/install/AGENTS.md). What each config file is and
where it lands: [local/README.md](local/README.md).

### Agent dispatcher (lif-dispatch)

`local/dispatch/` dispatches coding agents into disposable git worktrees inside
Herdr tabs, with a human-in-the-loop harvest cycle. It runs straight from this
checkout — no build:

```bash
node --experimental-strip-types local/dispatch/src/dispatch.mts <project> --task "..."
```

One-time setup: copy `local/dispatch/projects.example.json` to
`~/.config/lif-dispatch/projects.json` and fill in the absolute paths. Design
and failure modes: [local/dispatch/PRD.md](local/dispatch/PRD.md).

So that agents know when and how to invoke the dispatcher, install the
[skill](skills/lif-dispatch/SKILL.md):

```bash
npx skills add alandy88/lif-agents
```

## Remote environments (Sandcastle)

`@lif/sandcastle-kit` runs `.sandcastle/` agent pipelines: the agent loop,
prompts, model routing, branch and PR mechanics, and provider authentication. A
repo supplies a config file and a Dockerfile.

The package is `@lif/sandcastle-kit`; the repository is `lif-agents`.

### Install

```bash
npm i -D github:alandy88/lif-agents#v0.2.4
```

Pin a tag, never `#main`. `#main` carries no built output, and unattended runs
must not pick up kit changes without an explicit bump.

The machine that runs the pipeline needs Node ≥ 22 and a Docker daemon.

### Example configurations

`.sandcastle/config.mts` is both the config and the CLI entrypoint. `toolchain`
is the only required field; the supported values are `python`, `node` and
`dotnet`.

Issue-driven (`presets/implement`) — work comes from a GitHub issue with a
`## Tasks` checklist. Run it with
`npx tsx .sandcastle/config.mts --issue 42`:

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

Ledger-driven (`presets/task`) — work comes from `PLAN.md` with a `STATE.md`
ledger. Run it with `npx tsx .sandcastle/config.mts --iterations 3`:

```ts
import { isEntrypoint, runTaskLoop, type TaskConfig } from "@lif/sandcastle-kit/presets/task";

const config: TaskConfig = { toolchain: "dotnet" };

export default config;

if (isEntrypoint(import.meta.url)) await runTaskLoop(config);
```

To override the kit's prompts, point `templateDir` at a workspace-relative
directory; any same-named file there wins over the kit's default:

```ts
const config: ImplementConfig = {
  toolchain: "node",
  templateDir: ".sandcastle/templates",
};
```

### Further reading

- [remote/README.md](remote/README.md) — full config surface, the Dockerfile,
  credentials, CI wiring, prompt overrides, composing a lifecycle from phases.
- [remote/runner/README.md](remote/runner/README.md) — provisioning the
  self-hosted runner the reusable workflow targets.

## Working on this repo

```bash
npm test              # unit tests
npm run test:integration
npm run typecheck
npm run build
```

Release mechanics, layout rules, and sharp edges: [AGENTS.md](AGENTS.md).
