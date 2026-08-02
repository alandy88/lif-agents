# lif-terminal

Native-Windows terminal config: WezTerm + Herdr + Starship + the pwsh 7 profile.
Optional firstmate helpers launch into WSL; the terminal itself runs on Windows.

## Layout

| Path | Installed as |
|---|---|
| `wezterm/wezterm.lua` | `WEZTERM_CONFIG_FILE` env var |
| `starship/starship.toml` | `STARSHIP_CONFIG` env var |
| `herdr/config.toml` | copied to `%APPDATA%\herdr\config.toml` |
| `pwsh/profile.ps1` | dot-sourced from `$PROFILE` |
| `hosts/*.example` | templates for the host overlay (see below) |

Redirect env vars rather than symlinks: Windows symlinks need Developer Mode or
admin, and junctions only work on directories — which `wezterm.lua` and
`starship.toml` are not.

Herdr reads `%APPDATA%\herdr\config.toml` by default; `HERDR_CONFIG_PATH`
overrides that path. The repo copy is the source of truth — copy it over the
default path by hand:

```powershell
New-Item -ItemType Directory -Force "$env:APPDATA\herdr" | Out-Null
Copy-Item .\lif-terminal\herdr\config.toml "$env:APPDATA\herdr\config.toml"
```

## Prerequisites

Herdr is not installed by `install.ps1` — install it separately and let it
manage its own updates (`herdr update`).

## Install

```powershell
git clone https://github.com/alandy88/lif-terminal   # anywhere you keep checkouts
.\lif-terminal\install.ps1                          # -WhatIf to preview
```

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
Copy-Item .\lif-terminal\hosts\lif-host.lua.example "$env:USERPROFILE\.config\lif-host.lua"
Copy-Item .\lif-terminal\hosts\lif-host.ps1.example "$env:USERPROFILE\.config\lif-host.ps1"
```

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

`pwsh/profile.ps1` reads a BWS access token from `%USERPROFILE%\.bws\token.dpapi`
(DPAPI-encrypted, machine-bound, not in this repo); the project id it pairs with
comes from the host overlay. No secret values are tracked here.
