# Dispatching

```bash
node --experimental-strip-types <checkout>/local/dispatch/src/dispatch.mts <project> \
  --task "<text>" [--harness claude] [--model M] [--effort low|medium|high|xhigh] [--mode pr|local]
```

`<project>` must be a key in `~/.config/lif-dispatch/projects.json` — see
[projects.md](projects.md).

## Flags

| Flag | Notes |
| --- | --- |
| `--task` | The task text. Exactly one of `--task` or `--brief` is required. |
| `--brief <path>` | A hand-written brief file, used verbatim instead of the rendered one. |
| `--harness` | Defaults to the project's `harness`, then `claude`. Only `claude` is verified; others refuse. |
| `--model` | Passed to the harness as `--model M`. |
| `--effort` | `low`/`medium`/`high`/`xhigh`. Recorded on the task, but the claude adapter passes no flag — Claude Code has no stable launch flag for it. |
| `--mode` | `local` (default): work stays on a branch for the human to merge. `pr`: `land` pushes and opens a PR. |

## Writing the task

Write `--task` as a complete brief for an agent with zero context: what to
build or fix, where, and a checkable definition of done. The tool wraps it in a
rendered brief with worktree rules; you supply only the task itself. The
rendered brief is saved to `~/.config/lif-dispatch/briefs/<task-id>.md`.

For `--brief`, the file must contain a line `Delivery contract: mode=<mode>`
that agrees with `--mode`, or dispatch refuses before creating anything.

## What it creates

Dispatch refuses everything it can before any state exists, then creates, in
order: a worktree at `<scratchRoot>/<task-id>` on branch `dispatch/<task-id>`
cut from the project's base branch, a Herdr tab in the configured session, and
a task record. It prints the task id, worktree, branch, tab/pane and brief path.

The brief rides to the agent as a one-line pointer, not inline — Herdr refuses
to encode multi-line text as an agent argument.

## Expected first block

The fresh worktree triggers the harness's folder-trust prompt, so the agent
starts `blocked`. Answer it with:

```bash
herdr --session <session> agent send-keys <paneId> enter
```

The pane id is in the dispatch output and in `status`. This happens on every
dispatch; it is not an error.

## Sharp edges

- Never retry a failed `worktree add` with `--force`; run
  `git -C <project-path> worktree prune` and retry plainly.
- If the agent fails to start, the worktree and tab already exist and the task
  **is** recorded — harvest it with `abandon`, do not delete by hand.
- An isolation-assertion failure removes nothing on purpose. It means the
  worktree resolved to the primary checkout; inspect by hand and do not retry.
