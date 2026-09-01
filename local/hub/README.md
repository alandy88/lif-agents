# lif-hub — one message in, one agent worktree out

`lif-hub "message"` classifies the message into a **mode** (explore, plan, exec, verify,
deploy), an optional **domain**, and a **repo**, stacks the matching starter prompts from
`$LIF_NOTES_DIR/system/templates/starter-prompts.md`, and runs

    orca worktree create --repo path:<repo> --name <title-hhmm> --no-parent --agent claude --prompt "<prompt>" --activate --json

The classifier is one `claude -p` call on the model named in `profiles.json`. Repos come
from `orca repo list`; their descriptions come from `$LIF_GITHUB_DIR/personal/AGENTS.md`.

    lif-hub --list                                 modes, domains, repos
    lif-hub --dry-run "..."                        show routing and the full prompt, launch nothing
    lif-hub --mode exec --repo lif-studio "..."    skip the classifier
    lif-hub --domain none "..."                    override just the domain
    lif-hub --b64 <base64>                         shell-safe message (what the Orca panel sends)

Needs `LIF_NOTES_DIR` and `LIF_GITHUB_DIR`, both set by the environment overlay
(`~/.config/lif-host.sh`). Installed to `~/.local/bin/lif-hub` by `local/install/install.sh`.

## Main view: the hub page

`lif-hub open` starts a loopback server (port 47811) if one is not running and opens
`http://127.0.0.1:47811/` as an Orca browser tab in the `lif-notes` worktree. That tab is
the landing page: type a message, press Route, adjust mode/domain/repo on the card if the
guess is off, read the prompt, press Start agent. The right column lists what was started
this session. `lif-hub serve` runs the same server in the foreground.

Why a browser tab and not a native page: Orca's main views (`tasks`, `activity`,
`automations`, …) are a fixed list inside the app, and plugins may only add right-sidebar
panels. A browser tab is the one main-area surface a script can open. The server binds
loopback only and refuses cross-origin POSTs, so other pages cannot start agents.

## Orca side panel

`local/orca-plugins/lif-hub/` is an Orca plugin: a chat-style panel plus a worker that
raises a desktop notification when an agent needs you. Orca panels cannot run commands,
so the panel types `lif-hub --b64 ...` into a terminal of the focused worktree and the
CLI does the rest.

Enable it once: Orca → Settings → Plugins → turn the plugin system on → add this
directory as a dev plugin path → enable "LIF Hub" and accept its capabilities. The panel
appears in the right sidebar under the compass icon.
