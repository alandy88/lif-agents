# lif-terminal

Terminal config: WezTerm + Herdr + Starship + a shell profile — pwsh 7 on
Windows, zsh on macOS and WSL. Every environment uses all four; only the shell
profile differs. Pi's status footer is managed alongside those four terminal
components. The firstmate helpers run locally on the host that carries the
firstmate checkout; the pwsh profile reaches that host over ssh, because the
Windows box does not carry one.

Absorbed into `lif-agents` with history. This directory is the whole local
half of that repo: the configs below, the installers in `install/`, and the
per-machine overlays in `environments/`. Paths below are relative to this
directory unless stated otherwise.

## Layout

| Path | Installed as (Windows) | Installed as (macOS/WSL) |
|---|---|---|
| `wezterm/wezterm.lua` | `WEZTERM_CONFIG_FILE` env var | `$XDG_CONFIG_HOME/wezterm/wezterm.lua` |
| `starship/starship.toml` | `STARSHIP_CONFIG` env var | `$XDG_CONFIG_HOME/starship.toml` |
| `herdr/config.toml` | rendered to `%APPDATA%\herdr\config.toml` | rendered to `$XDG_CONFIG_HOME/herdr/config.toml` |
| `pwsh/profile.ps1` | dot-sourced from `$PROFILE` | — |
| `zsh/profile.zsh` | — | `~/.config/lif-shell.zsh`, sourced from `~/.zshrc` |
| `pi/extensions/pi-status-footer.ts` | `%USERPROFILE%\.pi\agent\extensions\pi-status-footer.ts` | `~/.pi/agent/extensions/pi-status-footer.ts` |
| `hosts/*.example` | templates for the environment overlay (see below) | same |

Redirect env vars rather than symlinks on Windows: Windows symlinks need
Developer Mode or admin, and junctions only work on directories — which
`wezterm.lua` and `starship.toml` are not. `install.sh` symlinks instead.

`herdr/config.toml` here is a **template**, not a drop-in copy: its
`default_shell` is environment-owned and substituted at install time.
`install.sh` does that automatically; the Windows copy step is in
[environments/windows-5090/README.md](environments/windows-5090/README.md).
Platform-specific config discovery and overrides are documented in the
[installation instructions](install/AGENTS.md).

## Prerequisites

Nothing here installs software. Herdr, WezTerm, Starship, the Nerd Font and the
agent CLIs must already be present. `quota-axi` is optional: without it, the
footer still shows model, thinking, and context data while quota fields are
unavailable. The full prerequisite list and platform-specific update commands
are in the [installation instructions](install/AGENTS.md).

## Install

```powershell
git clone https://github.com/alandy88/lif-agents   # anywhere you keep checkouts
.\lif-agents\local\install\install.ps1             # -WhatIf to preview
```

On macOS or WSL, run `local/install/install.sh` instead. It reuses the environment
recorded by the last run on that machine, detects `wsl` under WSL, and never
guesses on macOS -- so a first install there needs `--env <name>`. Both installers
also manage the Pi status footer at Pi's global user extension path. Pi discovers
it at startup; after an install or reinstall, restart Pi or run `/reload` in an
existing session to activate the new footer. Agents installing this on a machine
should follow [install/AGENTS.md](install/AGENTS.md), which covers the prerequisites and
the values that must be asked for rather than guessed.

Idempotent — re-run after a `git pull`. On Unix the footer is linked to the
checkout; on Windows it is copied because the installer does not require
symlink privileges. A regular footer file is backed up before replacement, and
an unrelated symlink at the destination is kept. `--dry-run` / `-WhatIf` previews
that work without touching the destination. See the installing-agent
instructions above for the complete backup behavior.

## Environment overlay

Machine-specific values belong to a named environment, one directory per machine
under `environments/` — see [environments/README.md](environments/README.md)
for the concept and for the exact list of values an environment owes. Two things
under `local/` still carry a machine-specific value, and both are placeholders
resolved at install time, not literals: `herdr/config.toml`'s `default_shell`,
and the `.example` overlay templates in `hosts/`.

The configs read the overlay from fixed paths:

| Overlay file | Read by |
|---|---|
| `~/.config/lif-host.lua` (`%USERPROFILE%\.config\` on Windows) | `wezterm/wezterm.lua` |
| `~/.config/lif-host.sh` | `zsh/profile.zsh` |
| `~/.config/lif-host.ps1` (`%USERPROFILE%\.config\` on Windows) | `pwsh/profile.ps1` |

`install.ps1` does not create them — on Windows, copy the templates by hand and
fill in the placeholders:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.config" | Out-Null
Copy-Item .\lif-agents\local\hosts\lif-host.lua.example "$env:USERPROFILE\.config\lif-host.lua"
Copy-Item .\lif-agents\local\hosts\lif-host.ps1.example "$env:USERPROFILE\.config\lif-host.ps1"
```

On macOS and WSL, `install.sh` symlinks them from `environments/<env>/` instead.
Those files are authored on the machine and gitignored — no populated overlay is
committed, for any environment.

Every key is optional. All three configs degrade safely without the overlay: a
missing or malformed `lif-host.lua` yields an empty launch menu with the rest of
the WezTerm config intact, and missing `lif-host.sh`/`lif-host.ps1` files leave
the affected shell functions warning instead of running. Malformed PowerShell
is also caught; `lif-host.sh` is sourced as shell code and must be syntactically
valid.

Then verify, because **WezTerm falls back to full defaults on any config error
without printing anything** — a clean-looking launch proves nothing:

```powershell
(wezterm show-keys | Select-String 'Split').Count    # 0 = loaded, 6 = defaults
```

Disabled assignments are removed from the key table rather than listed, so the
absence of the six default `Split*` bindings is the signal. Six means WezTerm
fell back to defaults and the config did not load.

Herdr validates its own config on demand:

```powershell
herdr config check    # validates config.toml and prints diagnostics
```

Once verified, remove the now-shadowed originals:

- `%USERPROFILE%\.wezterm.lua`
- `%USERPROFILE%\.config\starship.toml`

## Notes

Design decisions and the traps hit while building this stack live in the
`lif-notes` vault (`notes/terminal-setup.md`,
`notes/wezterm-zellij-keybindings.md`), not here. This README covers setup only.
Those notes still describe the Zellij era and have not been rewritten for Herdr.

The BWS access token is never in this repo and never in an overlay; only its
project id comes from the environment. Where the token itself sits is
platform-specific, because DPAPI has no unix counterpart:

| Host | At-rest store | Read by |
|---|---|---|
| Windows | `%USERPROFILE%\.bws\token.dpapi`, DPAPI-encrypted and machine-bound | `pwsh/profile.ps1` |
| macOS | Keychain item `lif-bws-token` — the platform's own at-rest store | `zsh/profile.zsh` |
| Linux/WSL | `~/.bws/token`, mode 0600; the profile refuses it if group/other can read it | `zsh/profile.zsh` |

The Linux fallback is weaker than the other two: plaintext at rest, no machine
binding, so use full-disk encryption. The profiles do not decrypt or export the
token at startup. Their `bws` compatibility functions load it only for each
`bws get`, `bws list`, `bws run`, or similar invocation, and remove it before a
`bws run` child starts.

Claude launchers are restricted and secret-free by default. `claude-bws` is the
explicit legacy whole-project injection command; treat that process as trusted
with every project secret. Migration and permission-mode opt-ins are documented
in [`environments/README.md`](environments/README.md).
