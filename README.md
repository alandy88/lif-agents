# lif-agents

This repo holds two separate things. Most people need only one of them.

- **`local/`** — the terminal setup on the captain's own machines: WezTerm,
  Starship, Herdr, and a shell profile.
- **`remote/`** — the kit: a package other repos install so agents can run
  their work in the cloud.

They share nothing but the repository. Installing one does nothing to the
other.

## The local half: terminal setup

Configuration files for a machine's terminal. It installs no software — it
points WezTerm, Starship, Herdr and your shell at the configs kept here.

```bash
git clone https://github.com/alandy88/lif-agents
cd lif-agents
local/install/install.sh --env <name> --dry-run   # preview
local/install/install.sh --env <name>             # install
```

On Windows, run `local\install\install.ps1` instead. Later runs need no
`--env`: the installer remembers the machine.

`<name>` is an *environment* — a named machine, not a platform, because two
Macs are two machines. The existing ones are directories under
`local/environments/`.

Setting this up on a machine is a job for an agent, and the full instructions
(prerequisites, the values it cannot guess) are in
[local/install/AGENTS.md](local/install/AGENTS.md). What each config file is
and where it lands: [local/README.md](local/README.md).

## The remote half: the agent kit

`@lif/sandcastle-kit` is the engine behind `.sandcastle/` agent pipelines. A
repo gets an autonomous agent lifecycle by writing one config file and a
Dockerfile; the kit handles the loop, the prompts, model routing, branch and PR
mechanics, and provider authentication.

The package name is `@lif/sandcastle-kit` — the repository was renamed, the
package was not.

```bash
npm i -D github:alandy88/lif-agents#v0.2.4
```

Pin a tag, never `#main`. Unattended runs must not pick up kit changes without
an explicit bump, and `#main` carries no built output anyway.

You need Node ≥ 22 and a Docker daemon on the machine that runs the pipeline.
`@ai-hero/sandcastle` is the kit's own dependency; consumers never install or
import it.

### Two lifecycles

| preset | source of work | run shape |
|---|---|---|
| `presets/implement` | a GitHub issue with a `## Tasks` checklist | plan → one fresh agent session per task → review → PR |
| `presets/task` | `PLAN.md` + a `STATE.md` ledger | next task → task session → fresh-context verify → PR → squash-merge, ×N |

A minimal `.sandcastle/config.mts` is both the config and the entrypoint:

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

`toolchain` is the only required field. Run it with
`npx tsx .sandcastle/config.mts --issue 42`.

### Where to go next

Everything else — the Dockerfile, credentials, CI wiring, the full config
surface, prompt overrides, and composing your own lifecycle out of the phases —
is in [remote/docs/kit-reference.md](remote/docs/kit-reference.md).

Provisioning for the self-hosted runner the reusable workflow targets is in
[remote/runner/README.md](remote/runner/README.md).

## Working on this repo

```bash
npm test              # unit tests
npm run test:integration
npm run typecheck
npm run build
```

Release mechanics, the layout rules, and the sharp edges are in
[AGENTS.md](AGENTS.md).
