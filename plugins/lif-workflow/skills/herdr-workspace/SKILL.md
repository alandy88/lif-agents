---
name: herdr-workspace
description: "Herdr workspace per repo: open a local repo by name as a Herdr workspace, lay out its tabs, put agents on it, and close it when the work ends. Use when the user asks to open, set up, or close a repo in Herdr, or to start agents on a repo there."
---

# Herdr workspace

One workspace per active repo: open it when work on the repo starts, close it when the work
ends. This skill adds repo lookup and a layout convention; the `herdr` skill owns the
commands. Load the `herdr` skill first — its `HERDR_ENV=1` guardrail, ID rules, and safety
rules govern every step here.

## Find the repo

The repos are the git checkouts beside the vault:

```bash
root="$(dirname "$LIF_NOTES_VAULT")"
for d in "$root"/*/; do [ -e "$d.git" ] && basename "$d"; done
```

If `LIF_NOTES_VAULT` is unset, source `~/.config/lif-host.sh` first. Match the user's name
case-insensitively against that list. When the user names a repo by purpose ("the
gateway"), read `$root/AGENTS.md`, which says what each repo is. No match → show the list
and ask. Cloning is outside this skill.

## Open

1. **Reuse.** Run `herdr workspace list`. A workspace whose `worktree.checkout_path` is
   `$root/<repo>`, or whose `label` is `<repo>`, already exists → `herdr workspace focus
   <workspace_id>` and stop.
2. **Create.**

   ```bash
   herdr workspace create --cwd "$root/<repo>" --label <repo> --focus
   ```

   Use `--no-focus` instead when setting up background agents the user will look at later.
3. **Name the first tab** `main`: `herdr tab rename <tab_id> main`, with the tab ID from
   `.result.tab.tab_id`.

Done when the user has the workspace ID and its first tab reads `main`.

## Layout

Tabs split by role, one role per tab, labels lowercase:

| Tab | Holds |
|---|---|
| `main` | the user's own agent or shell |
| `agents` | helper agents, one pane each |
| `server` | long-running dev servers |
| `logs` | tails and watchers |
| `review` | a reviewer agent reading the diff |

Create a tab at the moment something goes in it:

```bash
herdr tab create --workspace <workspace_id> --cwd "$root/<repo>" --label agents --no-focus
```

Its `.result.root_pane.pane_id` is the first slot. Add more panes to that tab with `herdr
pane split`, following the `herdr` skill's geometry rule.

## Agents on the repo

Each checkout has one writer. A second agent that edits files gets its own worktree:

```bash
herdr worktree create --workspace <workspace_id> --branch <branch> --label <repo>-<branch> --no-focus
```

That makes a linked workspace grouped under the repo's, with a checkout of its own; read its
workspace and root-pane IDs from the JSON response. Read-only agents — reviewers,
researchers — share the main checkout in the `agents` or `review` tab.

Start each agent in an empty shell pane with a name that says its job:

```bash
herdr agent start <name> --kind <kind> --pane <pane_id>
```

Use the kind the user asks for, else `claude`. Names are unique across the whole Herdr
server, so prefix the repo when two workspaces might both run a `reviewer`. Prompting,
waiting, and reading follow the `herdr` skill.

Done when the user has each agent's name, its workspace, and its pane ID.

## Close

Close when the user says the work on the repo is done.

1. Run `herdr agent list`. Any agent in this workspace still `working` or `blocked` → name
   it and ask before closing.
2. `herdr workspace close <workspace_id>` — this ends the panes and keeps every file.
3. It returns `workspace_group_close_required` → linked worktree workspaces are still open.
   Ask whether to close the whole group, then rerun with `--group`.

Deleting a worktree checkout is a separate, explicit step: `herdr worktree remove
--workspace <id>` runs `git worktree remove` and keeps the branch. Run it only when the user
asks, after confirming the branch is merged or pushed.
