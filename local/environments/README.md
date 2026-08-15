# environments/

**An environment is a named machine identity.** It owns every value that differs
between machines, so that nothing under `local/` has to. `macbookpro-work`,
`macmini`, `wsl` and `windows-5090` are environments. An environment names a
*machine*, not a platform: a second Mac gets its own directory, not a share of
this one's. There is no "default" environment and no platform is the base case
the others deviate from. In particular the Windows
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

Select an environment with `local/install/install.sh --env <name>`. The installer
records the name in `$XDG_CONFIG_HOME/lif-env`, so later runs on that machine
need no `--env`; failing that it detects `wsl` under WSL. It deliberately does
not guess on macOS -- no OS check can tell two Macs apart, and a wrong guess
would install the other machine's paths. `--host` is accepted as an alias.

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
| `LIF_GITHUB_DIR` / `GithubDir` | `github` jumps here; the function shadows GitHub Desktop's `github` launcher | **ask** |
| `LIF_BWS_PROJECT_ID` / `BwsProjectId` | Bitwarden Secrets project UUID | **ask**; secret-adjacent, see below |
| `LIF_FIRSTMATE_DIR` / `FirstmateDir` | firstmate checkout; `fm`/`fmsh` use it | `~/firstmate` by convention — confirm |
| `FirstmateHost` | ssh target the pwsh `fm`/`fmsh`/`fmw` reach; the firstmate host itself has no equivalent, since there they run locally | `windows-5090` only |
| `LIF_HERDR_PATH` / `HerdrPath` | herdr binary `fmw` runs; absolute, because a non-login ssh command misses the shell rc that puts it on PATH | **ask** — install location differs per platform |
| `LIF_HERDR_DEFAULT_SHELL` | shell Herdr opens panes with | defaults per platform, see below |
| `LIF_CLAUDE_PERMISSION_MODE_STANDARD` / `ClaudePermissionModeStandard` | `claude --permission-mode` the `cc` launcher uses | optional; falls back to the shared key, then restricted `default` |
| `LIF_CLAUDE_PERMISSION_MODE_PERSONAL` / `ClaudePermissionModePersonal` | `claude --permission-mode` the `ccp` launcher uses | optional; falls back to the shared key, then restricted `default` |
| `LIF_CLAUDE_PERMISSION_MODE_FIRSTMATE` / `ClaudePermissionModeFirstmate` | `claude --permission-mode` the local/remote `fm` launcher uses | optional; falls back to the shared key, then restricted `default` |
| `LIF_CLAUDE_PERMISSION_MODE` / `ClaudePermissionMode` | shared `claude --permission-mode` fallback | optional; omit for restricted `default`; set `bypassPermissions` only as an explicit unrestricted opt-in |

Eight values are captain-only: the three WezTerm cwds, the four directory
shortcuts, and the BWS project id.

The table is what an environment *owes*, not all it may hold. `host.sh` and
`host.ps1` are sourced as shell code, so they are also the right slot for a
machine's own environment - a PATH entry for a tool installed on one box, a
work-only variable, a token file to source. Anything no other machine wants
belongs there rather than in `local/`, which is shared by all of them.

`LIF_HERDR_DEFAULT_SHELL` fills `default_shell` in `local/herdr/config.toml`,
which ships as a template rather than a literal path precisely because that
value is environment-owned. `install.sh` defaults it to whichever `zsh` is on
PATH, falling back to your login shell. An *empty* value is
not equivalent to omitting it — Herdr falls back to Windows PowerShell 5.1 — so
the installer always writes a concrete value.

## Secrets

Overlay files may name a secret's *location*, never its value. The BWS project
id and the BWS access token stay out of git:

- The root `.gitignore` ignores `local/environments/*/host.{lua,sh,ps1}`, so a
  populated environment overlay cannot be committed by accident.
- The access token is never in an overlay or long-lived shell environment.
  The `bws` compatibility function reads Keychain, `~/.bws/token` (mode 0600),
  or DPAPI only for one CLI invocation. Ordinary `bws get`, `bws list`, and
  `bws run` calls remain unchanged; commands started by `bws run` have the
  access token removed before they start. See `local/README.md`.

## Claude and BWS migration

`cc`, `ccp`, bare `claude`, and `fm` now launch without BWS project injection
and use Claude's restricted `default` permission mode unless an overlay selects
another mode. Existing overlays that set a permission mode continue to work.
Set the relevant mode to `bypassPermissions` for an intentional unrestricted
launch; unrestricted behavior is no longer the implicit default.

`claude-bws [args...]` is the explicit legacy path that injects the entire
configured BWS project. It strips `BWS_ACCESS_TOKEN` and
`CLAUDE_CODE_OAUTH_TOKEN` from Claude; on Windows it clears inherited variables
before the child PowerShell profile starts, then BWS adds project secrets and
preserves its minimal system/PATH environment. Whole-project injection is a broad trust
boundary: use it only for a trusted task that needs those secrets. Prefer a
direct, task-specific `bws run` selection/allowlist when the installed BWS CLI
version provides one. Machines without a BWS project or token retain normal
non-BWS Claude behavior.

### Windows compatibility probe

Before changing the Windows broad launcher, run the explicit probe from a
configured PowerShell session (it is never run by install or CI):

```powershell
& <lif-agents-checkout>\local\install\probe-bws-windows.ps1 -ProjectId $LifHost.BwsProjectId
```

It invokes the installed `bws.exe` and authenticated `run` path twice with
temporary shell and no-op `claude.exe` executables: a baseline preserving the
parent environment, then the launcher's actual `--no-inherit-env` path. Both
start the configured PowerShell normally (not `-NoProfile`). The probe never
reads or reports secret values; it reports only the BWS version and booleans for
token absence, harmless parent-marker survival, PATH/SystemRoot availability,
and no-op launch success. All temporary executables/results are removed on
success or failure, and no profile or BWS configuration is changed.

Safe output is one JSON object with separate `baseline_*` and `actual_*`
outcomes. Token-absence, PATH/SystemRoot, authenticated-run, and no-op-launch
booleans must be `true`. Parent-survival is the compatibility decision under
test: baseline must be `true`, and `actual_parent_survived_* = false` proves
`--no-inherit-env` breaks launcher inputs. `bws_version` is a version string.
A false required value or `probe_failed=true` means stop and report the output;
it contains no credential material.

Consequently a populated environment directory is **not** committed: what a
committed environment directory carries is a `README.md` describing the machine,
while the values are placed on the machine itself. An environment nobody has
installed on yet has no README to write, so it holds only a `.gitkeep`.

## The environments

| Name | Machine | Overlay state |
|---|---|---|
| `windows-5090` | the Windows box | hand-placed in `%USERPROFILE%\.config\`, see its README |
| `macbookpro-work` | the work MacBook Pro | authored on the machine; sets `font_size`, `LIF_NOTES_DIR`, `LIF_GITHUB_DIR` and the machine-local extras, the rest deliberately unset |
| `macmini` | the Mac mini (`peter-macmini`) | authored on the machine; the firstmate host, see its README |
| `wsl` | the WSL box | empty slot; the installing agent authors it on the machine. Dormant: it hosted firstmate until that moved to `macmini`, and still carries a checkout at the same commit |

To set up a machine, follow [local/install/AGENTS.md](../install/AGENTS.md).
