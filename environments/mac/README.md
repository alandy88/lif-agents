# `mac` — the captain's Mac mini (`peter-macmini`)

macOS 26.5.2, arm64 (Apple Silicon), Homebrew at `/opt/homebrew/bin/brew`.
Installed with `install/install.sh` (detects `mac` on Darwin, no `--env` needed).

The overlay files themselves are **not** committed: `host.lua` and `host.sh` hold
the captain's real paths and are gitignored — see
[../README.md](../README.md#secrets). This file records what the machine owes and
what has already been settled on it, so the next agent does not re-derive it.

## What this machine owns

Of the seven captain-only values, exactly one exists here.

| Key | Value on this machine |
|---|---|
| `LIF_STUDIO_DIR` | `/Users/peteryu/repos/lif-studio` |
| `stable_diffusion_cwd` | absent — omit the key |
| `lif_node_cwd` | absent — omit the key |
| `playground_cwd` | absent — omit the key |
| `LIF_NOTES_DIR` | absent — omit the key |
| `LIF_IMAGEHUB_DIR` | absent — omit the key |
| `LIF_BWS_PROJECT_ID` | unused; this machine does not use BWS, so skip `install/AGENTS.md` §6 entirely |
| `LIF_FIRSTMATE_DIR` | absent — there is no firstmate checkout here |
| `LIF_HERDR_PATH` | absent — there is no `fm-herdr` launcher here |
| `LIF_HERDR_DEFAULT_SHELL` | leave unset; `install.sh` resolves `/bin/zsh` from PATH |

**Omit an absent key; never write `""`.** In Lua the empty string is ordinarily
truthy; `local/wezterm/wezterm.lua` defensively normalizes it to absent, but the
overlay should still say what it means.

An **empty launch menu is the correct outcome here**, not a failed install.

`font_size` is deliberately **omitted**, so WezTerm uses its default of 10. That
is a captain decision for this display, not an oversight — do not raise it
because the HiDPI note in `local/wezterm/wezterm.lua` suggests a Mac usually
wants more.

No `host.ps1`: there is no pwsh 7 on this machine.

## Settled on this machine

- Herdr installs from **homebrew-core**: `brew install herdr` → 0.7.5. Update it
  with `brew upgrade herdr`; `herdr update` refuses on a Homebrew install.
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
`~/hermes-vm`, `~/openclaw-vm`, `~/lif-receiver`, or anything under `~/Library`,
and run no Herdr lifecycle command on it.
