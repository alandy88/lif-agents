# lif-terminal

Native-Windows terminal config: WezTerm + psmux + Starship + the pwsh 7 profile.
No WSL.

## Layout

| Path | Installed as |
|---|---|
| `wezterm/wezterm.lua` | `WEZTERM_CONFIG_FILE` env var |
| `starship/starship.toml` | `STARSHIP_CONFIG` env var |
| `psmux/psmux.conf` | `PSMUX_CONFIG_FILE` env var |
| `pwsh/profile.ps1` | dot-sourced from `$PROFILE` |

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
git clone https://github.com/alandy88/lif-terminal D:\Git\lif-terminal
D:\Git\lif-terminal\install.ps1        # -WhatIf to preview
```

Idempotent — re-run after a `git pull`. It backs up anything it replaces to
`<name>.pre-lif-terminal.bak` and leaves the pre-existing configs in place.

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
(DPAPI-encrypted, machine-bound, not in this repo) and references a BWS project
id. No secret values are tracked here.
