# lif-agents

Two independent halves:

- **`local/`** — terminal configuration for the captain's machines: WezTerm,
  Starship, Herdr, and a shell profile.
- **`remote/`** — `@lif/sandcastle-kit`, the package other repos install to run
  `.sandcastle/` agent pipelines.

## `local/`: terminal configuration

```bash
git clone https://github.com/alandy88/lif-agents
cd lif-agents
local/install/install.sh --env <name> --dry-run   # preview
local/install/install.sh --env <name>             # install
```

On Windows, run `local\install\install.ps1` instead. Later runs need no
`--env`; the installer remembers the machine.

`<name>` is a directory under `local/environments/`.

Install instructions, including prerequisites and the values the installer
cannot guess: [local/install/AGENTS.md](local/install/AGENTS.md). What each
config file is and where it lands: [local/README.md](local/README.md).

## `remote/`: the agent kit

`@lif/sandcastle-kit` handles the agent loop, prompts, model routing, branch and
PR mechanics, and provider authentication. A consuming repo supplies one config
file and a Dockerfile.

The package is `@lif/sandcastle-kit`; the repository is `lif-agents`.

```bash
npm i -D github:alandy88/lif-agents#v0.2.4
```

Pin a tag, never `#main`. `#main` carries no built output, and unattended runs
must not pick up kit changes without an explicit bump.

Requirements on the machine that runs the pipeline: Node ≥ 22 and a Docker
daemon. `@ai-hero/sandcastle` is the kit's own dependency; consumers never
install or import it.

### Presets

| preset | source of work | run shape |
|---|---|---|
| `presets/implement` | a GitHub issue with a `## Tasks` checklist | plan → one fresh agent session per task → review → PR |
| `presets/task` | `PLAN.md` + a `STATE.md` ledger | next task → task session → fresh-context verify → PR → squash-merge, ×N |

### Minimal `.sandcastle/config.mts`

The config file is also the CLI entrypoint:

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

### Further reading

- [remote/README.md](remote/README.md) — full config surface, Dockerfile,
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
