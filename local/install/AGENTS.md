# Installing the terminal setup — instructions for the installing agent

**You are here because someone cloned this repo on a machine and asked you to
install it.** This file is the entrypoint for that. It covers the terminal
setup: WezTerm, Starship, Herdr, the shell profile, and Pi's managed status
footer and quiet-tools extension.

**Do not run `npm i -D github:alandy88/lif-agents`.** The README's kit section
belongs to `@lif/sandcastle-kit`, a JavaScript package other repos
depend on. It has nothing to do with this machine's terminal, and installing it
here does nothing the captain asked for.

This repo installs **no software**. It places configuration files. Everything in
"Prerequisites" has to exist first, and some of it needs the captain's
credentials or preferences — see "Stop and ask".

---

## 1. Work out which environment this is

An *environment* is a named machine identity that owns every machine-specific
value: see [local/environments/README.md](../environments/README.md), which lists
exactly what an environment owes. An environment names a **machine**, not a
platform. Existing names: `macbookpro-work`, `macmini`, `wsl`, `windows-5090`,
`linux-5090` (the Ubuntu side of the 5090 box; already installed there).

- Already installed on this machine → `local/install/install.sh` reads the name it
  recorded in `$XDG_CONFIG_HOME/lif-env`; no `--env` needed.
- WSL → `local/install/install.sh` detects `wsl`.
- Native Linux → nothing is detected; pass `--env linux-5090` on the 5090 box, or
  create a new environment for another Linux machine.
- macOS → **there is nothing to detect.** Do not assume this is an existing
  Mac environment because the OS matches; ask the captain which machine this
  is, then pass `--env <name>`.
- Windows → use `local/install/install.ps1` instead (see
  [local/README.md](../README.md)); the rest of this file does not apply.
- A machine with no environment yet → ask the captain for a name, create
  `local/environments/<name>/`, and pass `--env <name>`.

### A machine installed before the `mac` → `macbookpro-work` rename

`mac` used to be the Mac mini's name. It now belongs to the work MacBook Pro,
and the Mac mini is `macmini`. A Mac installed under the old name has no
`$XDG_CONFIG_HOME/lif-env` memo (the memo is only ever written by an install
that took `--env`), so `install.sh` there exits 2 until the move below is done.
Its two overlay files survive the rename as untracked files in a directory the
repo no longer knows about.

On the Mac mini, once, after this branch has merged and that machine has
pulled — the files are **untracked**, so plain `mv`, not `git mv`:

```bash
cd ~/repos/lif-agents && git pull
mkdir -p local/environments/macmini
mv local/environments/mac/host.lua local/environments/mac/host.sh local/environments/macmini/
rmdir local/environments/mac
local/install/install.sh --env macmini    # relinks lif-host.* and writes the memo
```

The final `install.sh --env macmini` is what makes every later run
argument-free. **Never run `local/install/install.sh --env macbookpro-work` on the
Mac mini.** `local/environments/macbookpro-work/` ships no overlay files, so the
installer takes its stale-overlay branch, *deletes* both `lif-host.*` symlinks
(`lif` stops working) and permanently records the machine as the wrong one.

## 2. Stop and ask the captain

Eight values cannot be inferred and must not be guessed. A plausible-looking
invented path is worse than no path: the launch menu silently opens agents in
the wrong directory, and `lif`/`notes`/`imagehub`/`github` fail confusingly.

| Ask for | Goes in |
|---|---|
| stable-diffusion checkout path | `host.lua` `stable_diffusion_cwd` |
| comfyui-lif-nodes checkout path | `host.lua` `lif_node_cwd` |
| playground checkout path | `host.lua` `playground_cwd` |
| lif-studio path | `host.sh` `LIF_STUDIO_DIR` |
| lif-notes path | `host.sh` `LIF_NOTES_DIR` |
| Image-MetaHub-Personal path | `host.sh` `LIF_IMAGEHUB_DIR` |
| general checkout root | `host.sh` `LIF_GITHUB_DIR` |
| Bitwarden Secrets project id (UUID) | `host.sh` `LIF_BWS_PROJECT_ID` |

Also worth confirming rather than assuming: whether this machine hosts firstmate
at all — only the host that does sets `LIF_FIRSTMATE_DIR` (`~/firstmate` by
convention) and `LIF_HERDR_PATH` (the herdr binary, absolute) — and whether this
machine uses BWS.

Ask for all of them in one message, then continue. Every key is optional at
runtime — an environment with none of them still installs and still gives a
working terminal, just with an empty launch menu and warning `lif`/`notes`
commands. Prefer that over inventing values.

## 3. Prerequisites

Install these first; the repo installs none of them. macOS commands assume
[Homebrew](https://brew.sh).

On a machine running services, prefix the `brew` commands with
`HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1`. Homebrew otherwise
runs `brew cleanup` on the first install after a 30-day gap, and its autoremove
step uninstalls orphaned formulae unrelated to the one you asked for — observed
on the captain's Mac mini, where `brew install herdr` also removed
`python@3.13`.

| Prerequisite | macOS | WSL (Ubuntu) | Native Linux (Ubuntu) |
|---|---|---|---|
| WezTerm | `brew install --cask wezterm` | installed on the **Windows** side; WSL only supplies the shell | upstream `.deb` from wezfurlong.org, or Flatpak |
| Starship | `brew install starship` | `curl -sS https://starship.rs/install.sh \| sh` | same as WSL |
| JetBrainsMono Nerd Font | `brew install --cask font-jetbrains-mono-nerd-font` | install on the Windows side, where WezTerm renders | unzip into `~/.local/share/fonts` and run `fc-cache -f` |
| Herdr | `brew install herdr`; update later with `brew upgrade herdr`. Do **not** use `herdr update` here — it answers `self-update is disabled for Homebrew installs` and exits 0, so it silently does nothing. *Verified on macOS 26.5.2*: herdr 0.8.0 is in homebrew-core | already present on the captain's WSL box; `herdr update` self-updates | upstream install script; `herdr update` self-updates |
| zsh | ships with macOS | `sudo apt install zsh` (WSL defaults to bash) | `sudo apt install zsh`, then `chsh -s /usr/bin/zsh` |
| `claude`, `codex`, `opencode` | the agents the launch menu and `cc` invoke; install per their own docs | same | same |
| `bws` (Bitwarden Secrets CLI) | only if this machine uses BWS | same | same as WSL |

`claude`, `codex`, `opencode`, `bws`, and `quota-axi` are optional: without them
the config still installs; affected functions simply fail when called, and the
footer leaves quota data unavailable.

## 4. Author the environment overlay

Create `local/environments/<env>/host.lua` and `local/environments/<env>/host.sh` from
`local/hosts/lif-host.lua.example` and `local/hosts/lif-host.sh.example`, filled
in with the answers from step 2. Write paths in this machine's own notation —
POSIX on macOS and WSL. Do not copy `windows-5090`'s drive paths.

These files are gitignored on purpose (they hold the captain's real paths and
the BWS project id). Leave them untracked; do not commit them, and do not
`git add -f`.

## 5. Run the installer

```bash
local/install/install.sh --env <name> --dry-run    # preview
local/install/install.sh --env <name>
```

`--env` is required on a macOS machine that has never been installed on, and
optional afterwards -- the installer records the name in
`$XDG_CONFIG_HOME/lif-env` and reuses it.

It is idempotent. Regular files and directories it replaces are backed up to
`<name>.pre-lif-terminal.bak`; an existing symlink is replaced without a backup.
The managed Pi extensions are linked to the checkout on Unix and copied on Windows.
A regular extension file is backed up before replacement; an unrelated symlink at
that destination is kept. `--dry-run` / `-WhatIf` previews these changes without
touching the destination. It:

- symlinks `wezterm.lua` and `starship.toml` into `$XDG_CONFIG_HOME`
- symlinks the environment's `host.lua` / `host.sh` / `host.ps1` to
  `~/.config/lif-host.*`. A machine installed before `environments/` moved under
  `local/` has these pointing at the old repo-root path; a rerun repairs them,
  including when the old path is gone and the link is dangling. A `lif-host.*`
  symlink pointing anywhere else is treated as the captain's own and kept
- symlinks the zsh profile to `~/.config/lif-shell.zsh` and appends one marked
  block to `~/.zshrc` that sources it (`--skip-shell-rc` opts out). It never
  rewrites an existing `~/.zshrc` — the captain curates that file
- renders `local/herdr/config.toml` into `$XDG_CONFIG_HOME/herdr/config.toml`,
  substituting this environment's `default_shell`. Herdr 0.7.5 reads that path
  on Linux and, *verified on macOS 26.5.2*, on macOS too: it resolves its config
  from `XDG_CONFIG_HOME` with a `~/.config` fallback and carries no "Application
  Support" path. Confirm with `herdr config check`; if a future version
  disagrees, point Herdr at the file with `HERDR_CONFIG_PATH`
- installs `local/pi/extensions/pi-status-footer.ts` at
  `~/.pi/agent/extensions/pi-status-footer.ts`. The footer shows the model,
  thinking effort, context usage, and applicable quota windows; quota refreshes
  retain only the non-secret display snapshot.
- installs `local/pi/extensions/quiet-tools.ts` at the same global extension
  directory. Built-in text tool rows are hidden by default; `/quiet-tools off`
  reveals them. Coverage and limitations: [Quiet tools](../README.md#quiet-tools-in-pi).
- records the environment name in `$XDG_CONFIG_HOME/lif-env`, last, so a run
  that failed partway does not record a name it never finished installing

The Starship prompt is wired by the profile (`starship init zsh`), not by
`~/.zshrc` directly, so it arrives with the rest of the profile. If the existing
`~/.zshrc` already runs `starship init`, the appended block does not remove it
and Starship initializes twice per shell — redundant rather than broken. Report
the duplicate line to the captain instead of deleting it yourself; the rc is
theirs.

If the captain's login shell is bash rather than zsh, add the same source line
to `~/.bashrc` by hand — the profile detects the shell and works in both.

## 6. Set up the BWS token (only if this machine uses BWS)

There is no DPAPI off Windows, so the token lives in the OS keystore:

- **macOS** — Keychain. The captain enters the token; you should not see it:
  `security add-generic-password -a "$USER" -s lif-bws-token -w`
- **Linux/WSL** — `~/.bws/token`, `chmod 600`. The profile refuses to read it
  if group or other can. This is weaker than DPAPI (no machine binding); say so
  rather than implying parity.

## 7. Verify, and report honestly

Pi discovers global extensions at startup. After installing or reinstalling,
restart Pi or use `/reload` in an existing session; a plain shell restart is not
enough for an already-running Pi process.

```bash
command -v wezterm >/dev/null || { echo 'wezterm not on PATH'; exit 1; }
! wezterm show-keys | grep -q Split  # exits 0 when the config loaded, 1 on the defaults fallback
herdr config check                   # validates the installed herdr config
exec zsh -l                          # prompt should be Starship; `cc`, `lif`, `fm` should exist
```

Use the assertion form: `grep -c Split` prints the `0` you want to see but
*exits 1* when the count is zero, so under `set -e` — or to any agent reading
the exit status — a successful install looks like a failed one. The check can
lie in the other direction too: without the `command -v` guard, a missing
`wezterm` (over `ssh host '…'`, under CI, or in any non-login shell without
Homebrew's PATH) produces no output, so `grep -q` finds nothing and the negation
exits 0 — certifying a machine it never inspected.

WezTerm falls back to its full defaults on any config error **and prints
nothing**, so a clean-looking launch proves nothing — run the `show-keys` check.
An empty launch menu is likewise indistinguishable from a working one until you
open the launcher, so open it.

Report what actually happened, including anything you skipped for a missing
prerequisite or an unanswered value. "Installed" while the launch menu is empty
is a false report.
