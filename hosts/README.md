# hosts/

One directory per machine, holding the values that differ between machines so
that nothing under `local/` has to. The configs read the overlay from a fixed
path in `~/.config`; the Unix installer puts the selected host's files there,
while Windows keeps its overlay manually managed at the same location.

| File | Read by | Installed as |
|---|---|---|
| `hosts/<name>/host.lua` | `local/wezterm/wezterm.lua` | `~/.config/lif-host.lua` |
| `hosts/<name>/host.ps1` | `local/pwsh/profile.ps1` | `~/.config/lif-host.ps1` |

Both files are optional and every key inside them is optional — a missing or
malformed overlay degrades to defaults rather than breaking the config. See
`local/hosts/*.example` for the full key list.

Select a host with `install/install.sh --host <name>`; with no `--host` it
detects `mac` on Darwin and `wsl` under WSL.

`wsl/` and `mac/` are empty slots: the Windows host keeps its overlay outside
the repo today, and the unix overlays get authored when those hosts adopt the
configs.
