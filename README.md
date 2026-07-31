# lif-terminal

Native-Windows terminal config: WezTerm + Starship + the pwsh 7 profile. No WSL.

Zellij is deliberately not tracked here — its `config.kdl` stays at
`%APPDATA%\Zellij\config\config.kdl`.

## Layout

| Path | Installed as |
|---|---|
| `wezterm/wezterm.lua` | `WEZTERM_CONFIG_FILE` env var |
| `starship/starship.toml` | `STARSHIP_CONFIG` env var |
| `pwsh/profile.ps1` | dot-sourced from `$PROFILE` |

Redirect env vars rather than symlinks: Windows symlinks need Developer Mode or
admin, and junctions only work on directories — which `wezterm.lua` and
`starship.toml` are not.

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
wezterm show-keys | Select-String 'ALT\|CTRL'
```

The pane-split disables should be listed. If they aren't, the config didn't
load.

Once verified, remove the now-shadowed originals:

- `%USERPROFILE%\.wezterm.lua`
- `%USERPROFILE%\.config\starship.toml`

## Notes

Design decisions and the traps hit while building this stack live in the
`lif-notes` vault (`notes/terminal-setup.md`,
`notes/wezterm-zellij-keybindings.md`), not here. This README covers setup only.

`pwsh/profile.ps1` reads a BWS access token from `%USERPROFILE%\.bws\token.dpapi`
(DPAPI-encrypted, machine-bound, not in this repo) and references a BWS project
id. No secret values are tracked here.
