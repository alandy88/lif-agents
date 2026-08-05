---
name: lif-dispatch
description: Dispatch a coding agent into an isolated git worktree in a Herdr tab, then track, collect and land its work. Use when the user asks to dispatch, delegate or farm out a task to a background agent, or to check on / harvest previously dispatched tasks.
---

# lif-dispatch

lif-dispatch puts a coding agent to work on a registered project in a disposable
git worktree inside a Herdr tab, records the task, and gives the human a
harvest loop: `status` → `collect` → `land` or `abandon`. It is built for
1–3 concurrent tasks with a human deciding what merges — never land or discard
work without the user's say-so.

## Locating the tool

The commands live in the user's `lif-agents` checkout under
`local/dispatch/src/`. Find the checkout path in
`~/.config/lif-dispatch/projects.json` — if a project named `lif-agents` is
registered, its `path` is the checkout. Otherwise ask the user where
`lif-agents` is cloned.

Every command is run as:

```bash
node --experimental-strip-types <checkout>/local/dispatch/src/<command>.mts ...
```

Requirements: Node ≥ 22, a running Herdr server with `herdr` on `PATH`, and
`gh` authenticated if a task will land as a PR.

## One-time configuration

`~/.config/lif-dispatch/projects.json` registers the projects that can receive
dispatches. If it is missing, copy
`<checkout>/local/dispatch/projects.example.json` there and fill in absolute
paths: `scratchRoot` (where disposable worktrees are created) and one entry per
project. This file is machine-local; never commit it.

## When to dispatch versus doing it inline

Dispatch when the task is self-contained, parallelizable, and in a registered
project — a bugfix, a well-scoped feature, a mechanical refactor the user wants
off their plate while they do something else. Do it inline when the task needs
back-and-forth with the user, touches the repo you are already working in, or
is faster to do than to brief.

## Dispatching

```bash
node --experimental-strip-types <checkout>/local/dispatch/src/dispatch.mts <project> \
  --task "<text>" [--harness claude] [--model M] [--effort low|medium|high|xhigh] [--mode pr|local]
```

- `--mode local` (default): work stays on a branch for the human to merge.
  `--mode pr`: `land` will push and open a PR.
- Only the `claude` harness is verified today; others refuse by design.
- Write `--task` as a complete brief for an agent with zero context: what to
  build or fix, where, and a checkable definition of done. The tool wraps it in
  a rendered brief with worktree rules; you supply only the task itself.
- For a hand-written brief use `--brief <path>` instead; the file must contain
  a line `Delivery contract: mode=<mode>` that agrees with `--mode`, or
  dispatch refuses.

The command prints the task id, worktree, branch, and Herdr tab/pane.

**Expected first block:** the fresh worktree triggers the harness's
folder-trust prompt, so the agent starts `blocked`. Answer it with:

```bash
herdr --session <session> agent send-keys <paneId> enter
```

The pane id is in the dispatch output and in `status`. This happens on every
dispatch; it is not an error.

## Tracking and harvesting

```bash
node --experimental-strip-types <checkout>/local/dispatch/src/status.mts
```

One line per open task; `!! BLOCKED` means the agent is waiting on input —
read the pane (`herdr --session <session> pane read <paneId>`) to see what it
is asking.

```bash
node --experimental-strip-types <checkout>/local/dispatch/src/collect.mts <task-id>
```

`collect` presents Git truth (commits, diffstat, dirtiness) plus the pane tail
and writes a note stub. It decides nothing — show the result to the user. A
clean worktree with no commits and an idle agent usually means the agent asked
a question and stopped; read the pane.

```bash
node --experimental-strip-types <checkout>/local/dispatch/src/collect.mts land <task-id>
node --experimental-strip-types <checkout>/local/dispatch/src/collect.mts abandon <task-id> [--discard]
```

- `land` in pr mode pushes and opens the PR (refuses if the branch is behind
  base — tell the user; never rebase or force-push to make it pass). In local
  mode it reports the ready branch and keeps the worktree.
- `abandon` cleans up the worktree, tab and branch. It refuses if unlanded
  work exists; `--discard` overrides, and only with the user's explicit
  approval.

## Sharp edges

- Never retry a failed `worktree add` with `--force`; run
  `git -C <project> worktree prune` and retry plainly.
- If `~/.config/lif-dispatch/tasks.json` is reported corrupt, fix or move it
  by hand — never delete it; it is the only record of live worktrees and tabs.
- A "broken worktree" (directory exists, not a git repo) is Windows lock
  residue; `abandon` handles it, `--discard` required if it has contents.
