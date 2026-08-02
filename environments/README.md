# environments/

**An environment is a named machine identity.** It owns every value that differs
between machines, so that nothing under `local/` has to. `mac`, `wsl` and
`windows-5090` are environments; there is no "default" environment and no
platform is the base case the others deviate from. In particular the Windows
drive paths (`D:\Git\...`, `C:\Program Files\PowerShell\7\pwsh.exe`) are the
property of `windows-5090` only.

One directory per environment, each holding up to three files:

| File | Read by | Installed as |
|---|---|---|
| `<env>/host.lua` | `local/wezterm/wezterm.lua` | `~/.config/lif-host.lua` |
| `<env>/host.sh` | `local/zsh/profile.zsh` | `~/.config/lif-host.sh` |
| `<env>/host.ps1` | `local/pwsh/profile.ps1` | `~/.config/lif-host.ps1` |

The installed names keep the `lif-host` prefix the configs already read; renaming
them would break the Windows overlay, which is hand-placed at those paths.

Every file is optional and every key inside it is optional. Missing overlays
degrade to defaults rather than breaking the config; malformed Lua and
PowerShell overlays do too. `host.sh` is sourced as shell code and must be
syntactically valid. Templates with the full key list:
`local/hosts/lif-host.{lua,sh,ps1}.example`.

Select an environment with `install/install.sh --env <name>`; with no `--env` it
detects `mac` on Darwin and `wsl` under WSL. `--host` is accepted as an alias.

## What an environment owes

This is the complete list. An installing agent reads this table to know what to
ask for; **anything marked "ask" cannot be inferred and must come from the
captain** — never invent a plausible-looking path.

| Key (`host.lua`) | Meaning | Source |
|---|---|---|
| `stable_diffusion_cwd` | checkout the launch menu opens agents in | **ask** |
| `lif_node_cwd` | checkout the launch menu opens agents in | **ask** |
| `playground_cwd` | checkout the launch menu opens agents in | **ask** |
| `font_size` | WezTerm font size for this display | optional; omit for 10 |

| Key (`host.sh` / `host.ps1`) | Meaning | Source |
|---|---|---|
| `LIF_STUDIO_DIR` / `StudioDir` | `lif` jumps here | **ask** |
| `LIF_NOTES_DIR` / `NotesDir` | `notes` jumps here | **ask** |
| `LIF_IMAGEHUB_DIR` / `ImageHubDir` | `imagehub` jumps here | **ask** |
| `LIF_BWS_PROJECT_ID` / `BwsProjectId` | Bitwarden Secrets project UUID | **ask**; secret-adjacent, see below |
| `LIF_FIRSTMATE_DIR` / `FirstmateDir` | firstmate checkout; `fm`/`fmsh` use it | `~/firstmate` by convention — confirm |
| `LIF_HERDR_PATH` / `HerdrPath` | launcher `fmw` runs | `~/.local/bin/fm-herdr` by convention — confirm |
| `LIF_HERDR_DEFAULT_SHELL` | shell Herdr opens panes with | defaults per platform, see below |
| `WslDistro` | distro the pwsh `fm*` bridges target | `windows-5090` only; no unix meaning |

Seven values are captain-only: the three WezTerm cwds, the three directory
shortcuts, and the BWS project id.

`LIF_HERDR_DEFAULT_SHELL` fills `default_shell` in `local/herdr/config.toml`,
which ships as a template rather than a literal path precisely because that
value is environment-owned. `install.sh` defaults it to whichever `zsh` is on
PATH, falling back to your login shell. An *empty* value is
not equivalent to omitting it — Herdr falls back to Windows PowerShell 5.1 — so
the installer always writes a concrete value.

## Secrets

Overlay files may name a secret's *location*, never its value. The BWS project
id and the BWS access token stay out of git:

- The root `.gitignore` ignores `environments/*/host.{lua,sh,ps1}`, so a
  populated environment overlay cannot be committed by accident.
- The access token is never in an overlay at all. macOS reads it from the
  Keychain, Linux/WSL from `~/.bws/token` (mode 0600), Windows from a DPAPI
  blob — see `local/README.md`.

Consequently a populated environment directory is **not** committed: committed
environment directories carry a `README.md` describing the machine, and the
values are placed on the machine itself.

## The environments

| Name | Machine | Overlay state |
|---|---|---|
| `windows-5090` | the Windows box | hand-placed in `%USERPROFILE%\.config\`, see its README |
| `mac` | a Mac | empty slot; the installing agent authors it on the machine |
| `wsl` | the WSL box | empty slot; the installing agent authors it on the machine |

To set up a machine, follow [install/AGENTS.md](../install/AGENTS.md).
