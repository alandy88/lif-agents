# Project management

A project is an entry in `~/.config/lif-dispatch/projects.json`. There is no
`add`/`list`/`remove` command — the file is hand-edited. Its keys are the
`<project>` argument accepted by `dispatch.mts`.

## First-time setup

If the file is missing, every command fails with
`No project config at ... Copy local/dispatch/projects.example.json there`.
Copy `<checkout>/local/dispatch/projects.example.json` to
`~/.config/lif-dispatch/projects.json` and fill in absolute paths.

```json
{
  "scratchRoot": "/home/peteryu/.lif-worktrees",
  "session": "default",
  "projects": {
    "lif-agents": {
      "path": "/home/peteryu/github/personal/lif-agents",
      "harness": "claude",
      "baseBranch": "main"
    }
  }
}
```

Top-level keys are global, not per-project:

- `scratchRoot` — where disposable worktrees are created, one directory per
  task id. Default: `~/.lif-worktrees`.
- `session` — the named Herdr session to dispatch into. Default: `"default"`.

## Adding a project

Append a key under `projects`. Fields:

| Field | Required | Notes |
| --- | --- | --- |
| `path` | yes | Absolute path to the primary checkout. A relative path is refused at dispatch time. Forward slashes are fine on Windows. |
| `harness` | no | `claude`, `codex`, `grok`, `pi` or `opencode`. Only `claude` has a verified adapter; the others refuse to dispatch by design. Default `claude`; `--harness` overrides per dispatch. |
| `baseBranch` | no | Branch that task branches are cut from, and the base for `collect`'s commit count and `land`'s behind-check. Default `"main"`. |

Validation happens only when a dispatch names the project, so a typo'd path
sits silent until it is used. To check an entry, run a dispatch against it —
or read the file.

## Listing projects

No command. Read the file, or provoke the error: dispatching an unknown name
prints `Unknown project X. Known projects: a, b, c`.

## Renaming a project

Safe for new dispatches. Existing records in `tasks.json` keep the old name in
their `project` field:

- `collect` and `land` still work — they use the recorded worktree path — but
  the base branch silently falls back to `main`, which is wrong if the project
  used a different one.
- `abandon` **breaks**: it resolves the project to run `worktree remove` from
  the primary checkout, and reports `no project entry for <old-name>`.

So harvest open tasks before renaming, or keep the old key as a duplicate entry
until they are closed.

## Removing a project

Close every open task for it first (`status`, then `land` or `abandon` each).
Removing the entry while tasks are open leaves orphaned worktrees under
`scratchRoot` that `abandon` can no longer clean up.

## Sharp edges

- The config is machine-local and holds absolute paths from one machine. Do not
  commit it; `projects.example.json` in the repo is the template only.
- A corrupt `projects.json` fails loudly rather than reading as empty. Fix the
  JSON by hand.
- Two projects may point at the same `path` with different `baseBranch` values;
  nothing prevents it, and worktrees stay isolated per task id.
