---
name: lif-dispatch
description: Dispatch a coding agent into an isolated git worktree in a Herdr tab, then track, collect and land its work. Use this skill whenever the user wants to dispatch, delegate, farm out, hand off or background a coding task to another agent; whenever they ask what dispatched tasks are running or want to check on, collect, land or abandon one; and whenever they want to register, list, rename or remove a dispatchable project — even if they never say "lif-dispatch" by name.
---

# lif-dispatch

lif-dispatch puts a coding agent to work on a registered project in a disposable
git worktree inside a Herdr tab, records the task, and gives the human a
harvest loop: `status` → `collect` → `land` or `abandon`. It is built for
1–3 concurrent tasks with a human deciding what merges — never land or discard
work without the user's say-so.

## Routing

Each reference below is self-contained. Read only the one that matches the
request — loading all three costs context and buries the part that matters.

| Read | When the user wants to |
| --- | --- |
| [references/projects.md](references/projects.md) | Register, inspect, rename or remove a dispatchable project; first-time setup; an `Unknown project` or `No project config` error |
| [references/dispatching.md](references/dispatching.md) | Send a task to an agent; choose harness/model/effort/mode; write or hand off a brief; answer the expected first-block prompt |
| [references/harvesting.md](references/harvesting.md) | See what is running; collect, land or abandon a task; recover one that is stuck, blocked or broken |

A request often spans two of these — "dispatch this to my new repo" needs
projects.md first, then dispatching.md. Read them in that order rather than
guessing at the config format.

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
`gh` authenticated if a task will land as a PR. Configuration lives in
`~/.config/lif-dispatch/` (`projects.json`, `tasks.json`, `briefs/`, `notes/`)
and is machine-local — never commit it.

## When to dispatch versus doing it inline

Dispatch when the task is self-contained, parallelizable, and in a registered
project — a bugfix, a well-scoped feature, a mechanical refactor the user wants
off their plate while they do something else. Do it inline when the task needs
back-and-forth with the user, touches the repo you are already working in, or
is faster to do than to brief.
