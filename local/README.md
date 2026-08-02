# lif-terminal

Terminal config: WezTerm + psmux + Starship + the pwsh 7 profile. Windows is
the primary host; WSL and macOS install the WezTerm and Starship halves. The
optional firstmate helpers launch into WSL.

Absorbed into `lif-sandcastle` with history; the installers now live one level
up in `install/`, and the per-machine overlays in `hosts/`. Paths below are
relative to this directory unless stated otherwise.

## Layout

| Path | Installed as |
|---|---|
| `wezterm/wezterm.lua` | `WEZTERM_CONFIG_FILE` env var |
| `starship/starship.toml` | `STARSHIP_CONFIG` env var |
| `psmux/psmux.conf` | `PSMUX_CONFIG_FILE` env var |
| `pwsh/profile.ps1` | dot-sourced from `$PROFILE` |
| `hosts/*.example` | templates for the host overlay (see below) |

The repo-root `install/install.sh` covers WSL and macOS, symlinking
`wezterm/wezterm.lua` and `starship/starship.toml` into `~/.config` instead.

Redirect env vars rather than symlinks: Windows symlinks need Developer Mode or
admin, and junctions only work on directories — which `wezterm.lua`,
`starship.toml`, and `psmux.conf` are not.

## Prerequisites

psmux is not installed by `install.ps1` — it comes from winget:

```powershell
winget install psmux
```

It ships `psmux`, `pmux`, and `tmux` aliases, all the same binary.

## Install

```powershell
git clone https://github.com/alandy88/lif-sandcastle   # anywhere you keep checkouts
.\lif-sandcastle\install\install.ps1                  # -WhatIf to preview
```

On WSL or macOS, run `install/install.sh --host <name>` instead.

Idempotent — re-run after a `git pull`. It backs up anything it replaces to
`<name>.pre-lif-terminal.bak` and leaves the pre-existing configs in place.

## Host overlay

Nothing in this repo carries machine-specific values. Paths, the WSL distro
name, and the BWS project id live in two files **outside** the repo, which are
never committed:

| Overlay file | Read by |
|---|---|
| `%USERPROFILE%\.config\lif-host.lua` | `wezterm/wezterm.lua` |
| `%USERPROFILE%\.config\lif-host.ps1` | `pwsh/profile.ps1` |

`install.ps1` does not create them — copy the templates by hand and fill in the
placeholders:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.config" | Out-Null
Copy-Item .\lif-sandcastle\local\hosts\lif-host.lua.example "$env:USERPROFILE\.config\lif-host.lua"
Copy-Item .\lif-sandcastle\local\hosts\lif-host.ps1.example "$env:USERPROFILE\.config\lif-host.ps1"
```

On WSL and macOS `install.sh` does this step for you, from a committed
`hosts/<name>/` directory rather than a hand-copied file.

Every key is optional. Both configs degrade safely without the overlay: a
missing or malformed `lif-host.lua` yields
an empty launch menu with the rest of the WezTerm config intact, and a missing
or malformed `lif-host.ps1` leaves the affected pwsh functions warning instead
of running.

Then verify, because **WezTerm falls back to full defaults on any config error
without printing anything** — a clean-looking launch proves nothing:

```powershell
(wezterm show-keys | Select-String 'Split').Count    # 0 = loaded, 6 = defaults
```

Disabled assignments are removed from the key table rather than listed, so the
absence of the six default `Split*` bindings is the signal. Six means WezTerm
fell back to defaults and the config did not load.

psmux has no such silent fallback — it reports its config path directly:

```powershell
psmux display-message -p '#{prefix}'    # C-a = loaded, C-b = defaults
```

Once verified, remove the now-shadowed originals:

- `%USERPROFILE%\.wezterm.lua`
- `%USERPROFILE%\.config\starship.toml`

## Notes

Design decisions and the traps hit while building this stack live in the
`lif-notes` vault (`notes/terminal-setup.md`,
`notes/wezterm-zellij-keybindings.md`), not here. This README covers setup only.
Those notes still describe the Zellij era and have not been rewritten for psmux.

`pwsh/profile.ps1` reads a BWS access token from `%USERPROFILE%\.bws\token.dpapi`
(DPAPI-encrypted, machine-bound, not in this repo); the project id it pairs with
comes from the host overlay. No secret values are tracked here.
