# lif-hub — one message in, one agent worktree out

`lif-hub "message"` classifies the message into a **mode** (explore, plan, exec, verify,
deploy), an optional **domain**, and a **repo**, stacks the matching starter prompts from
`$LIF_NOTES_DIR/system/templates/starter-prompts.md`, and hands the result to a
**backend**, the tool that owns worktrees and terminals. Two exist, in `src/orca.mts` and
`src/herdr.mts`; each lists repos, launches, and opens the hub page (`src/backend.mts`).

    orca   orca worktree create --repo path:<repo> --name <title-hhmm> --no-parent --agent claude --prompt "<prompt>" --activate --json
    herdr  herdr worktree create --cwd <repo> --branch <title-hhmm> --label <title-hhmm> --focus
           herdr agent start <title-hhmm> --kind claude --pane <root pane>
           herdr agent prompt <title-hhmm> "<prompt>"

`--backend orca|herdr` or `LIF_HUB_BACKEND` picks; unset, Herdr is used inside a Herdr
pane (`HERDR_ENV=1`) and Orca everywhere else. Orca repos come from `orca repo list`.
Herdr keeps no repo registry, so its repos are the git checkouts under
`$LIF_GITHUB_DIR/personal`. Repo descriptions come from `$LIF_GITHUB_DIR/personal/AGENTS.md`
either way. The classifier is one `claude -p` call on the model named in `profiles.json`.

    lif-hub --list                                 modes, domains, repos
    lif-hub --dry-run "..."                        show routing and the full prompt, launch nothing
    lif-hub --mode exec --repo lif-studio "..."    skip the classifier
    lif-hub --domain none "..."                    override just the domain
    lif-hub --b64 <base64>                         shell-safe message (what the Orca panel sends)
    lif-hub --backend herdr "..."                  launch through Herdr instead of Orca

Needs `LIF_NOTES_DIR` and `LIF_GITHUB_DIR`, both set by the environment overlay
(`~/.config/lif-host.sh`). Installed to `~/.local/bin/lif-hub` by `local/install/install.sh`.

## Main view: the hub page

`lif-hub open` starts a loopback server (port 47811) if one is not running and opens
`http://127.0.0.1:47811/`: as an Orca browser tab in the `lif-notes` worktree, or in the
desktop browser under Herdr, which has no browser of its own. That page is
the landing page: type a message, press Route, adjust mode/domain/repo on the card if the
guess is off, read the prompt, press Start agent. The right column lists every agent the
hub has started, newest first, from the launch log at
`$XDG_STATE_HOME/lif-hub/launches.json` (default `~/.local/state/lif-hub/launches.json`,
newest 200 kept). Clicking one brings its terminal to the front: Orca via
`orca terminal switch` on the terminal found by `orca terminal list`, Herdr via
`herdr workspace focus`. Orca terminal handles change when Orca restarts, so the lookup
happens on every click. `lif-hub serve` runs the same server in the foreground.

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
