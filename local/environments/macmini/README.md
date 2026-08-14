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
| `LIF_FIRSTMATE_DIR` | `/Users/peteryu/firstmate` |
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
- **This machine hosts firstmate.** `~/firstmate` is the live checkout, and the
  Herdr server here holds the workspace the captain attaches to. The Windows
  `fmw` reaches it over ssh (`FirstmateHost`); locally `fmw` runs `herdr`
  directly. The workspace persists in `~/.config/herdr/session.json`, so
  nothing bootstraps it per-attach — do not port the `fm-herdr` create-and-retry
  launcher from the WSL box, which existed only because that host started cold.
- Herdr resolves its config from `XDG_CONFIG_HOME/herdr` with a `~/.config`
  fallback on macOS, exactly as on Linux. `HERDR_CONFIG_PATH` is not needed.
- Starship and the JetBrainsMono Nerd Font are installed **outside Homebrew** —
  `~/.local/bin/starship` and 96 font files hand-placed in `~/Library/Fonts`.
  `brew install --cask font-jetbrains-mono-nerd-font` fails on the existing
  files; that is expected here and must not be forced.
- `~/.zshrc` is captain-curated, including an Openclaw completion `source` line
  that must survive. The installer appends its marked block and never rewrites
  the file.

## Do not disturb

This box runs the captain's Hermes agent and the Openclaw gateway. Do not touch
`~/hermes-vm`, `~/openclaw-vm`, `~/lif-receiver`, or anything under `~/Library`.

Herdr lifecycle commands were once banned here outright. That no longer holds —
the captain's own session lives on this machine's Herdr server — but the reason
behind the ban does: killing the server or a wedged client takes the captain's
workspace with it. Read state freely; stop or restart nothing without asking.
