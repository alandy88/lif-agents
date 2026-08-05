# Tracking and harvesting

The loop is `status` → `collect` → `land` or `abandon`. `collect` decides
nothing — show its output to the user and let them choose.

## status

```bash
node --experimental-strip-types <checkout>/local/dispatch/src/status.mts
```

One line per open task (anything not yet landed or abandoned):

```
<task-id>  <project>  <harness>  <state>  agent=<state>  worktree=<state>  unlanded=<n>
```

`!! BLOCKED` means the agent is waiting on input — read the pane with
`herdr --session <session> pane read <paneId>` to see what it is asking.

`unlanded=<n>` is trustworthy only when `worktree=clean` or `worktree=dirty`.
When the worktree is `broken` or `missing`, Git could not be read at all and
the count falls back to 0 — that is "unknown", not "no work", and reading it as
"nothing to lose" is how work gets thrown away. The branch usually survives in
the primary checkout, so count it there instead:

```bash
git -C <project-path> log --oneline <base>..dispatch/<task-id>
```

## collect

```bash
node --experimental-strip-types <checkout>/local/dispatch/src/collect.mts <task-id>
```

Presents Git truth (commits on `base..HEAD`, diffstat, dirtiness) plus the last
60 lines of the pane, then a one-line verdict. It writes a note stub to
`~/.config/lif-dispatch/notes/<task-id>.md` for the human to fill in and file.

Two verdicts look identical on the Git axis and want opposite actions:

- *nothing produced* (agent gone) — the work is not coming; abandon.
- *nothing produced YET* (agent idle/unknown) — the agent is probably waiting
  on a question. Read the pane tail; the answer belongs in the pane.

Herdr `idle` is not proof of completion — it reads idle during a long
foreground tool call.

## land

```bash
node --experimental-strip-types <checkout>/local/dispatch/src/collect.mts land <task-id>
```

`land` takes no flags. The delivery mode was fixed at dispatch time and is read
back from the task record, so what happens is decided by how the task was
dispatched, not by anything you pass here:

- **In local mode** it reports the ready branch and **keeps the worktree** on
  purpose. After the user merges the branch, `abandon` cleans up. Refuses if
  there are no commits.
- **In pr mode** it pushes `-u origin <branch>` and runs
  `gh pr create --fill-first`. Refuses if the branch is behind base — tell the
  user; never rebase or force-push to make it pass. If `gh` fails the push still
  stands and the command prints the manual `gh pr create` line.

Uncommitted changes are never landed; `land` says so and leaves them.

`land` also refuses outright when the worktree is broken or missing — it has
nothing to read. That is not a dead end: see "Recovering a broken task" below,
because the commits are on the branch, not in the directory.

## abandon

```bash
node --experimental-strip-types <checkout>/local/dispatch/src/collect.mts abandon <task-id> [--discard]
```

Closes the Herdr tab, removes the worktree, prunes, and deletes the branch.
It refuses when the worktree is dirty or has unlanded commits. `--discard`
overrides that and throws the work away — only with the user's explicit
approval.

## Recovering a broken task

- **Worktree broken** (the directory exists but is not a git worktree): Windows
  lock residue from a half-finished removal. **Worktree missing**: the directory
  is gone entirely. Either way `land` refuses and `status` reports a meaningless
  `unlanded=0`, so establish what survived before cleaning up:

  ```bash
  git -C <project-path> log --oneline <base>..dispatch/<task-id>
  ```

  Commits live on the branch, which the primary checkout still has. If that
  shows work worth keeping, merge or cherry-pick it from the primary checkout by
  hand — `land` cannot help once the worktree is unreadable. Once the branch is
  safe, `abandon` clears the record; `--discard` is required only if the broken
  directory still has contents.
- **Tab won't close / pane gone**: a warning, not a failure. The cleanup
  continues.
- **Branch not deleted** (unmerged): also a warning. The record closes anyway;
  delete the branch by hand if you want it gone.
- **Corrupt `tasks.json`**: fix or move it by hand — never delete it. It is the
  only record of live worktrees and tabs.
- **`no project entry for <name>`** on abandon: the project was renamed or
  removed from `projects.json` while the task was open. Restore the entry, then
  abandon again. See [projects.md](projects.md) in this directory.
