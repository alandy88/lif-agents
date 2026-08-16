# macmini — the captain's Mac mini (`peter-macmini`)

macOS 26.5.2, arm64 (Apple Silicon), Homebrew at `/opt/homebrew/bin/brew`.

This machine was installed before the `mac` → `macbookpro-work` rename, when
`mac` was its name; see "A machine installed before the rename" in
[local/install/AGENTS.md](../../install/AGENTS.md) for the one-time move that finishes
that rename on the machine itself. Until that move is done, `install.sh` there
exits 2 rather than installing.

**Its overlay files are deliberately not committed** — `host.lua` and `host.sh`
hold the captain's real paths and are gitignored, see
[../README.md](../README.md#secrets). After the move they live at
`local/environments/macmini/host.{lua,sh}` on the machine, symlinked to
`~/.config/lif-host.{lua,sh}` by `local/install/install.sh --env macmini`. This file
records what the machine owes and what has already been settled on it, so the
next agent does not re-derive it.

No `host.ps1`: there is no pwsh 7 on this machine.

## What this machine owns

Of the eight captain-only values in [../README.md](../README.md), exactly one
exists here.

| Key | Value on this machine |
|---|---|
| `LIF_STUDIO_DIR` | `/Users/peteryu/repos/lif-studio` |
| `stable_diffusion_cwd` | absent — omit the key |
| `lif_node_cwd` | absent — omit the key |
| `playground_cwd` | absent — omit the key |
| `LIF_NOTES_DIR` | absent — omit the key |
| `LIF_IMAGEHUB_DIR` | absent — omit the key |
| `LIF_GITHUB_DIR` | absent — omit the key |
| `LIF_BWS_PROJECT_ID` | unused; this machine does not use BWS, so skip `local/install/AGENTS.md` §6 entirely |
| `LIF_FIRSTMATE_DIR` | absent — omit the key; firstmate runs under the separate `firstmate` account, not this one |
| `LIF_HERDR_PATH` | `/opt/homebrew/bin/herdr` — plain herdr, not an `fm-herdr` wrapper |
| `LIF_HERDR_DEFAULT_SHELL` | leave unset; `install.sh` resolves `/bin/zsh` from PATH |

**Omit an absent key; never write `""`.** In Lua the empty string is ordinarily
truthy; `local/wezterm/wezterm.lua` defensively normalizes it to absent via
`cwd_or_nil`, but the overlay should still say what it means.

An **empty launch menu is the correct outcome here**, not a failed install.

`font_size` is deliberately **omitted**, so WezTerm uses its default of 10. That
is a captain decision for this display, not an oversight — do not raise it
because the HiDPI note in `local/wezterm/wezterm.lua` suggests a Mac usually
wants more, and do not add a `font_size` key to this environment's `host.lua`.

The window treatment is shared, not machine-specific: this machine takes the
same titlebar-less, transparent, blurred window as the rest of the fleet, by
explicit captain decision. Do not add a per-machine `window_decorations`
override.

## Settled on this machine

- Herdr installs from **homebrew-core**: `brew install herdr` → 0.8.0. Update it
  with `brew upgrade herdr`; `herdr update` refuses on a Homebrew install.
- **This machine hosts firstmate, under a dedicated `firstmate` account (uid
  503) — not `peteryu`.** The live checkout is `/Users/firstmate/firstmate`
  with its own Herdr server, projects, and toolchain; the captain reaches it
  with `ssh firstmate@100.110.209.2` and the Windows `fmw` targets the same
  account. The separate account *is* the isolation boundary — agent work must
  not land in the captain's home. The workspace persists in that account's
  `~/.config/herdr/session.json`, so nothing bootstraps it per-attach — do not
  port the `fm-herdr` create-and-retry launcher from the WSL box, which existed
  only because that host started cold.
- The `peteryu` account deliberately has **no** firstmate: its overlay omits
  `LIF_FIRSTMATE_DIR`/`LIF_HERDR_PATH` so `fm`/`fmsh`/`fmw` warn there rather
  than run. On 2026-08-14 a Moshi client configured with the wrong username put
  a full firstmate home under `peteryu`; it was torn down on 2026-08-15 and the
  remains parked at `~/firstmate.retired-20260815` and
  `~/.treehouse.retired-20260815`. If either reappears, something is pointing at
  the wrong account again.
- Herdr resolves its config from `XDG_CONFIG_HOME/herdr` with a `~/.config`
  fallback on macOS, exactly as on Linux. `HERDR_CONFIG_PATH` is not needed.
- Starship and the JetBrainsMono Nerd Font are installed **outside Homebrew** —
  `~/.local/bin/starship` and 96 font files hand-placed in `~/Library/Fonts`.
  `brew install --cask font-jetbrains-mono-nerd-font` fails on the existing
  files; that is expected here and must not be forced.
- `~/.zshrc` is captain-curated, including an Openclaw completion `source` line
  that must survive. The installer appends its marked block and never rewrites
  the file.

## `firstmate` account: hand-placed `~/.zshenv`

Like the pwsh overlay, this file is **hand-placed and uncommitted** — the home
directory is not a checkout, there is no chezmoi or stow, and `install.sh` only
appends its marked block to `~/.zshrc` and never owns a shell rc. Nothing in the
repo migrates or restores it. Recreate it by hand if the account is ever rebuilt.

It exists because zsh reads `.zshenv` for *every* shell, including the non-login,
non-interactive one that `ssh host 'cmd'` spawns — which skips `.zprofile` and
`.zshrc` entirely. That is the shell the Windows `fm`/`fmw`/`hermes` bridges land
in, so anything they need to resolve remotely has to live here.

The stakes differ per consumer: `fmw` fails loudly with "command not found" if
this file is missing, but `hermes` fails **silently** — with no `HERMES_HOME`,
hermes creates a fresh `~/.hermes` and answers as a stranger with no memory,
which reads as Marin having lost her past rather than as a broken bridge.

```sh
# Firstmate toolchain. Guarded because .zprofile and .zshrc prepend the same
# block for login/interactive shells, and would otherwise duplicate it.
case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$HOME/.local/bin:$PATH" ;;
esac
export NVM_DIR="$HOME/.nvm"
_nvm_default=$(cat "$NVM_DIR/alias/default" 2>/dev/null)
if [ -n "$_nvm_default" ] && [ -d "$NVM_DIR/versions/node/v$_nvm_default/bin" ]; then
    case ":$PATH:" in
        *":$NVM_DIR/versions/node/v$_nvm_default/bin:"*) ;;
        *) export PATH="$NVM_DIR/versions/node/v$_nvm_default/bin:$PATH" ;;
    esac
fi
unset _nvm_default

export HERMES_HOME=/opt/hermes-state/.hermes
export HERMES_TUI_DIR="$HOME/hermes-tui-build/ui-tui"
export HERMES_NODE=/usr/local/bin/node
```

**The duplicate toolchain block in `.zprofile` and `.zshrc` is load-bearing — do
not delete it as redundant.** macOS `/etc/zprofile` runs `path_helper` *after*
`.zshenv`, which hoists the system directories back to the front of PATH. Without
`.zprofile` re-asserting order afterwards, a login shell resolves `node` to
`/usr/local/bin/node` (v24.13.0) instead of nvm's v24.18.1, and — worse —
`/opt/homebrew/bin` outranks nvm, putting the **broken** Homebrew node (v25.5.0,
missing `libsqlite3.dylib`) one absent file away from winning. Backups of both
files sit at `~/.zprofile.bak-2026-08-16` and `~/.zshrc.bak-2026-08-16`.

`HERMES_NODE` is pinned for the same reason: `/usr/local/bin/node` is a working
standalone install, and hermes must not pick up the Homebrew one.

`HERMES_TUI_DIR` points at a prebuilt TUI bundle at `~/hermes-tui-build/ui-tui`,
outside the sealed `root:wheel` hermes code tree. `hermes_cli/main.py` honours it
and skips the npm-install path, which is the only way this account can run
`--tui` at all, since it cannot build in place. Because that lookup also bypasses
the staleness check, a Hermes upgrade will **not** rebuild the bundle — rerun
`npm install && npm run build` in `~/hermes-tui-build/ui-tui` after upgrading, or
the old TUI keeps running silently. Note `npm approve-scripts esbuild` is
required first; npm 11 blocks postinstall scripts, so esbuild otherwise has no
platform binary.

## Do not disturb

This box runs the captain's Hermes agent and the Openclaw gateway. Do not touch
`~/hermes-vm`, `~/openclaw-vm`, `~/lif-receiver`, or anything under `~/Library`.

Herdr lifecycle commands were once banned here outright. That no longer holds —
the captain's own session lives on this machine, on the **`firstmate` account's**
Herdr server — but the reason behind the ban does: killing that server or a
wedged client takes the captain's workspace with it. Read state freely; stop or
restart nothing without asking.
