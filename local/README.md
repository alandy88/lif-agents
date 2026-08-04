# lif-terminal

Terminal config: WezTerm + Herdr + Starship + a shell profile — pwsh 7 on
Windows, zsh on macOS and WSL. Every environment uses all four; only the shell
profile differs. On Windows the firstmate helpers bridge into WSL, on macOS and
WSL they run locally.

Absorbed into `lif-agents` with history; the installers now live one level
up in `install/`, and the per-machine overlays in `environments/`. Paths below
are relative to this directory unless stated otherwise.

## Layout

| Path | Installed as (Windows) | Installed as (macOS/WSL) |
|---|---|---|
| `wezterm/wezterm.lua` | `WEZTERM_CONFIG_FILE` env var | `$XDG_CONFIG_HOME/wezterm/wezterm.lua` |
| `starship/starship.toml` | `STARSHIP_CONFIG` env var | `$XDG_CONFIG_HOME/starship.toml` |
| `herdr/config.toml` | rendered to `%APPDATA%\herdr\config.toml` | rendered to `$XDG_CONFIG_HOME/herdr/config.toml` |
| `pwsh/profile.ps1` | dot-sourced from `$PROFILE` | — |
| `zsh/profile.zsh` | — | `~/.config/lif-shell.zsh`, sourced from `~/.zshrc` |
| `hosts/*.example` | templates for the environment overlay (see below) | same |

Redirect env vars rather than symlinks on Windows: Windows symlinks need
Developer Mode or admin, and junctions only work on directories — which
`wezterm.lua` and `starship.toml` are not. `install.sh` symlinks instead.

`herdr/config.toml` here is a **template**, not a drop-in copy: its
`default_shell` is environment-owned and substituted at install time.
`install.sh` does that automatically; the Windows copy step is in
[environments/windows-5090/README.md](../environments/windows-5090/README.md).
Platform-specific config discovery and overrides are documented in the
[installation instructions](../install/AGENTS.md).

## Prerequisites

Nothing here installs software. Herdr, WezTerm, Starship, the Nerd Font and the
agent CLIs must already be present. The full prerequisite list and
platform-specific update commands are in the
[installation instructions](../install/AGENTS.md).

## Install

```powershell
git clone https://github.com/alandy88/lif-agents   # anywhere you keep checkouts
.\lif-agents\install\install.ps1                   # -WhatIf to preview
```

On macOS or WSL, run `install/install.sh` instead. It reuses the environment
recorded by the last run on that machine, detects `wsl` under WSL, and never
guesses on macOS -- so a first install there needs `--env <name>`. Agents
installing this on a machine should follow
[install/AGENTS.md](../install/AGENTS.md), which covers the prerequisites and
the values that must be asked for rather than guessed.

Idempotent — re-run after a `git pull`. See the installing-agent instructions
above for the Unix installer's backup behavior.

## Environment overlay

Machine-specific values belong to a named environment, one directory per machine
under `environments/` — see [environments/README.md](../environments/README.md)
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
binding. Full-disk encryption, or exporting `BWS_ACCESS_TOKEN` from a password
manager before the profile loads, closes that gap.
