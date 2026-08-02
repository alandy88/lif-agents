# macmini

The captain's Mac mini (`peteryu@peter-macmini`) — macOS 26.5.2, arm64. It was
installed before the `mac` → `macbookpro-work` rename, when `mac` was this
machine's name; see "A machine installed before the rename" in
[install/AGENTS.md](../../install/AGENTS.md) for the one-time move that finishes
that rename on the machine itself.

**Its overlay files are deliberately not committed** — the root `.gitignore`
keeps `environments/*/host.{lua,sh,ps1}` out of the repo. They live on the
machine at `environments/macmini/host.lua` and `environments/macmini/host.sh`,
symlinked to `~/.config/lif-host.lua` and `~/.config/lif-host.sh` by
`install/install.sh --env macmini`.

`host.ps1` has no meaning here: the pwsh profile is not installed on macOS.

## What this environment sets

Of the eight captain-only values in
[environments/README.md](../README.md), this machine owns exactly one:

| Key | Value |
|---|---|
| `LIF_STUDIO_DIR` (`host.sh`) | `/Users/peteryu/repos/lif-studio` |

Everything else is deliberately unset. The three WezTerm launch-menu cwds
(`stable_diffusion_cwd`, `lif_node_cwd`, `playground_cwd`) have no checkouts on
this machine, so the launch menu is correctly empty; `notes`, `imagehub` and
`github` are not used here.

**`font_size` stays at 10** — the WezTerm default this repo ships. That is an
explicit captain decision for this display, not an oversight. Do not raise it
and do not add a `font_size` key to this environment's `host.lua`.

The window treatment is shared, not machine-specific: this machine takes the
same titlebar-less, transparent, blurred window as the rest of the fleet, also
by explicit captain decision. Do not add a per-machine `window_decorations`
override.
