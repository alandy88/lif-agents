# PRD — `lif-dispatch`: a minimal Herdr agent dispatcher

Status: **reviewed** — independent review completed 2026-08-05 (Fable subagent,
session rooted in `lif-agents`); findings folded in throughout, Q0/Q4 resolved.
Author: drafted with Claude Opus 5, 2026-08-05
Home: `lif-agents/local/dispatch/`

---

## 1. Problem

Dispatching a coding agent to work on a repo that is *not* the current directory is
currently manual: open a Herdr tab, `cd` somewhere, create a worktree by hand,
remember which CLI takes `--effort` versus `-c model_reasoning_effort=`, paste a
prompt, and then remember three days later which of the six open tabs was doing what.

There is a mature solution to this — [Firstmate](https://github.com/kunchenguid/firstmate),
~40k lines of bash across ~130 scripts — but it solves a strictly larger problem:
*unattended* fleet management. Roughly 70% of its code is supervision machinery (a
polling watcher, a durable wake queue, a per-harness semantic busy-state contract,
wedge escalation, an AFK daemon, turn-end guard hooks for six harnesses, PR merge
polling, and "secondmates" — persistent sub-firstmates with isolated homes).

We want the dispatch and bookkeeping half, with a human in the loop, at N=1–3
concurrent agents.

## 2. Goals

- Dispatch an agent task to any registered Git project with a named harness, model,
  and effort, from anywhere, in one command.
- Guarantee the agent works in an isolated Git worktree, never in a primary checkout.
- Track what was dispatched, where it landed, and what state it's in — durably,
  across sessions and machine restarts.
- Harvest finished work: read the result, land or discard the worktree, file notes
  into `lif-notes`.
- Keep the main Claude Code session as the *interface* — it plans, dispatches,
  harvests, and takes notes; it does not supervise.

## 3. Non-goals

Explicitly cut, with the reason each is affordable at this scale:

| Cut | Why it's affordable |
|---|---|
| Polling watcher / wake queue | A human is present. Herdr's native agent state answers "is it done" on demand. |
| Semantic per-harness busy-state contract | Only needed to decide whether to *auto-escalate*. We escalate to a human by them looking. |
| AFK sub-supervisor daemon | No walk-away operation in scope. |
| Turn-end guard hooks (6 harnesses) | These exist so an unattended primary never ends a turn blind. Not applicable. |
| Secondmates | A second architecture for scale we don't have. |
| Delivery-mode trifecta + no-mistakes pipeline | Landing policy is per-task and human-decided. |
| X mode (public bot relay) | Not a use case. |
| Herdr presentation spaces, projection journals, focus-safe close choreography | Legibility machinery for a 20-tab sidebar. |
| ANSI composer / ghost-text classification | Only needed to safely *inject* text into a pane unattended. |

## 4. Placement and language

### 4.1 Placement — `local/`, not `remote/`

`lif-agents` has two halves that "share nothing but the repository" (`AGENTS.md`):

- `remote/` is **the kit** — `@lif/sandcastle-kit`, a repo-agnostic, CI-oriented
  orchestration engine that other repos install by git URL and that cuts a tagged
  release whenever its built payload changes.
- `local/` is **this machine's setup** — WezTerm, Herdr, Starship, shell profiles,
  installers, and per-machine overlays under `local/environments/`.

`lif-dispatch` is machine-local, interactive, and depends on a running Herdr server
and locally-installed agent CLIs. It is not repo-agnostic and must never be pulled
into a consumer's `node_modules`. **It belongs in `local/`.**

This is a judgment call worth confirming — `local/` today is terminal *configuration*
(an absorbed `lif-terminal` subtree), and this is the first executable tool to live
there. See Q1.

Concrete consequence: `local/dispatch/` must stay outside `package.json`'s `files`
array. Note the Bun hazard already recorded in `AGENTS.md` — **Bun ignores `files` and
copies the entire tag tree into `node_modules`** — so keep this directory small and
free of binaries regardless.

### 4.2 Language — TypeScript `.mts`, not bash

An earlier sketch proposed ~400 lines of bash, mirroring Firstmate. **Reject that.**
Firstmate is bash because it must run under any harness on any POSIX host with no
runtime assumptions. Neither constraint applies here, and three things argue against it:

1. **The repo is already Node 22 + TypeScript `.mts`**, with `tsc` typecheck and
   `node --experimental-strip-types --test` as the test runner. A bash island would
   be the only thing in the repo needing a different toolchain.
2. **The primary machine is Windows 11 / PowerShell.** Git Bash exists, but bash on
   Windows means path translation pain (`D:\` vs `/d/`), CRLF hazards, and a
   `git worktree` path that must be handed to a Windows-native agent CLI. Every
   boundary crossing is a bug surface.
3. **Herdr's CLI returns JSON.** Firstmate pipes every call through `jq`. Node parses
   it natively with real types.

Runtime: `node --experimental-strip-types` (already the repo's test invocation) or
`tsx`. No build step for local use.

**Portability requirement:** the tool must also run on macOS and WSL, since
`local/environments/` names four machines (`windows-5090`, `macmini`,
`macbookpro-work`, `wsl`). Node makes this nearly free; use `node:path` throughout and
never shell out to `sh -c`.

## 5. Architecture

Four components. Everything else is a library detail.

```
local/dispatch/
  src/
    dispatch.mts     # resolve project -> worktree -> herdr tab -> launch
    collect.mts      # read result, land or discard, emit note
    status.mts       # one-shot fleet sweep over tasks.json (see 5.7)
    harness.mts      # harness -> launch command table (the whole adapter layer)
    herdr.mts        # typed wrapper over the herdr CLI
    brief.mts        # brief scaffold generator
    store.mts        # task store read/write
  projects.example.json  # committed template: name -> path, default harness/branch
  PRD.md
~/.config/lif-dispatch/
  projects.json      # machine-local, gitignored: name -> path, default harness, default branch
  tasks.json         # machine-local, gitignored: live task state
```

`projects.json` lives under `~/.config/lif-dispatch/`, not in the repo. The review
caught the contradiction in the original draft: a committed `name -> path` map holds
machine-local absolute paths across four machines, which violates `AGENTS.md`'s rule
that machine-specific values belong in `local/environments/<machine>/`. A gitignored
config plus a committed example keeps the facts on disk (§6) without committing paths.

### 5.1 `harness.mts` — the adapter layer

One table mapping harness name to a launch command with placeholder tokens. This is
the single highest-value thing to lift from Firstmate (`bin/fm-spawn.sh:810-854`).

```ts
type Harness = 'claude' | 'codex' | 'grok' | 'pi' | 'opencode';

interface HarnessAdapter {
  bin: string;
  autonomyFlag: string[];              // --dangerously-skip-permissions, --always-approve, --auto
  modelFlag: (m: string) => string[];
  effortFlag: (e: Effort) => string[]; // [] when unsupported — record, don't pass
  env?: Record<string, string>;
}
```

Brief delivery is positional-only — and the positional payload is a **one-line
pointer to the brief file on disk**, not the brief text. Herdr refuses multi-line
agent arguments ("cannot be encoded safely for the target shell", verified live
2026-08-05), and the brief is already written to
`~/.config/lif-dispatch/briefs/<task-id>.md` before launch.

The original draft included kimi with a
`pointer-after-ready` delivery mode (kimi rejects positional prompts), but the review
flagged the contradiction: injecting text into a live pane after readiness is exactly
what Firstmate's ANSI composer exists to do safely, and §3 cuts the composer. Kimi is
out of scope; re-adding it means knowingly rebuilding a sliver of the composer.

Two rules carried over verbatim, both load-bearing:

- **No adapter entry = refuse to dispatch.** This is the unverified-adapter guard.
  Adding a harness is a deliberate act with a verification step, not a fallback.
- **An unsupported effort value is recorded in task metadata but omitted from the
  launch command.** Preserves the requested profile for audit without passing a
  known-bad flag. (Kimi and OpenCode have no effort flag; Grok caps at `high`.)

Per-harness facts worth encoding as data rather than prose: exit command, interrupt
key, skill-invocation prefix (`/skill` for claude/grok, `$skill` for codex).

### 5.2 `herdr.mts` — typed CLI wrapper

Every call goes through one function that sets `HERDR_SESSION` **and** appends a
trailing `--session <name>`. Firstmate verified empirically that the env var alone is
not honored once another Herdr server is bound on the machine — queries silently
route to the wrong server rather than refusing.

**Placement rule, non-negotiable:** the task tab is created in the workspace resolved
from the launcher's *injected socket identity* (`HERDR_WORKSPACE_ID`, read live from
Herdr, not from the process snapshot). Herdr does not enforce workspace or tab label
uniqueness, so **a label is never placement authority and never destructive
authority.** If identity cannot be resolved exactly — missing socket identity, closed
pane, pane and tab disagreeing about their workspace — **refuse the dispatch before
any endpoint exists.** Do not fall back to a label search.

When the dispatcher runs *outside* Herdr (a plain PowerShell prompt), fall back to one
workspace labeled `lif-dispatch`, created on first use. Two workspaces sharing that
label is an unresolvable placement: refuse.

Minimum surface: `workspaceResolve()`, `tabCreate()`, `paneRead()`, `agentGet()`,
`tabClose()`.

### 5.3 `brief.mts` — prompt scaffold

A template function producing the task prompt, with a `{TASK}` hole the human or main
agent fills. Fixed sections: Task, Setup (worktree isolation assertion), Rules,
Definition of done.

**The contract line.** The generated brief embeds a machine-readable
`Delivery contract: mode=<mode>` line, and `dispatch.mts` refuses to launch when its
own `--mode` argument disagrees with the brief on disk. This is cheap and it prevents
the specific failure where a hand-edited prompt silently disagrees with what got
recorded.

Modes here are simpler than Firstmate's: `pr` (push and open a PR) or `local`
(commit on the branch and stop). No pipeline integration.

### 5.4 Worktree isolation — asserted twice

1. **Dispatcher-side:** resolve the worktree with `git -C <project> worktree add`,
   then assert the resolved path is a real worktree root and is *not* the project's
   primary checkout. Fail before creating a Herdr tab.
2. **In the brief text:** the agent's first instruction is to run
   `git rev-parse --show-toplevel`, verify it resolves to the disposable worktree,
   and stop with a `blocked` note otherwise. (Shell-agnostic on purpose: the earlier
   draft also asked for `pwd -P`, which doesn't exist in PowerShell — an agent whose
   shell is pwsh would fail the brief's own check.)

Belt and braces, because the failure mode — an agent committing to a primary checkout
that has uncommitted work — is expensive and silent.

Firstmate uses a worktree *pool* (`treehouse`). We create worktrees on demand under a
configured scratch root (default `%USERPROFILE%\.lif-worktrees\<task-id>` /
`~/.lif-worktrees/<task-id>`). Pooling is a performance optimization for high task
churn; it is not needed at N=3.

### 5.5 `store.mts` — task state

A single JSON file holding **current state**, not an event log.

```ts
interface Task {
  id: string;               // <project>-<slug>-<short-random>
  project: string;
  harness: Harness;
  model?: string;
  effort?: Effort;
  mode: 'pr' | 'local';
  worktree: string;         // absolute
  branch: string;
  herdr: { session: string; workspaceId: string; tabId: string; paneId: string };
  briefPath: string;
  state: 'dispatched' | 'collected' | 'landed' | 'abandoned';
  createdAt: string;
  collectedAt?: string;
  result?: { summary: string; prUrl?: string; notePath?: string };
}
```

Firstmate's status files are append-only *because a watcher tails them for wake
events*, which forces the awkward "a status line is a wake event, not current state"
distinction repeated throughout its `AGENTS.md`. Without a watcher that distinction is
dead weight — store current state and mutate it.

JSON over SQLite: one reader, one writer, no concurrency, human-inspectable, no native
dependency to build on four platforms. Revisit only if it stops being true.

"One writer" is aspirational the moment `dispatch` and `collect` run from two shells,
so all writes go through temp-file-plus-rename. One line of code buys atomicity.

### 5.6 `collect.mts` — the harvest path

This is the half that gets underspecified and then hurts. Designing it up front.

`collect <task-id>` performs, in order:

1. **Liveness and readiness.** `herdr agent get` on the recorded pane.
   Herdr reports `busy` / `idle` / `blocked` natively — a real advantage over tmux.
   Caveat carried from Firstmate's verification: **a native `busy` is trustworthy
   evidence of activity; a native `idle` is not proof of completion**, because
   `agent.get` reports *generation* state and reads idle while the agent blocks on a
   long-running foreground tool call. `blocked` means a permission dialog is up and
   surfaces immediately.
2. **Git truth, not pane truth.** The authoritative "did it do anything" signal is
   `git -C <worktree> status --porcelain` plus `git log <base>..HEAD`. The pane is
   supporting evidence, not the record.
3. **Pane capture** for the human summary — a bounded tail via `herdr pane read`.
   Request generously and trim locally (Firstmate found `pane read --lines N` returns
   empty when N is below the viewport height; it asks for ≥200 and trims).
4. **Present, don't decide.** Print: commits on the branch, diffstat, pane tail,
   worktree cleanliness. Landing is a separate explicit command.
5. **Land or abandon.** `land` pushes and opens a PR (mode `pr`) or reports the ready
   branch (mode `local`). Before pushing, `land` checks whether the branch is behind
   its base or the push would conflict — **detect and report, never auto-rebase**.
   `abandon` removes the worktree — and **refuses if the worktree is dirty or holds
   unlanded commits**, unless given an explicit `--discard`. Never force. After a
   successful worktree removal, run `git worktree prune` and delete the task branch
   from the primary repo; abandoned branches must not accumulate.

   Ordering, learned live on Windows: the herdr tab is closed **before**
   `worktree remove` (still after Git state is read) — the pane's shell sits in the
   worktree and holds a directory lock. And because `tab close` returns before the
   pane process has exited, the removal is retried briefly rather than failed on
   the first Permission denied.
6. **Note.** Emit a note stub into `lif-notes` with task id, project, what changed,
   and the PR URL. Filing it is the main agent's job; `collect` produces the material.

**Failure modes to handle explicitly:**

- *Orphaned worktree* — task record exists, Herdr pane is gone. Recover from Git:
  the worktree and branch are the durable artifacts; the pane was always disposable.
- *Orphaned pane* — pane exists, task record lost. `git worktree list` on each
  registered project is the reconciliation source.
- *Agent stopped mid-turn without committing* — most common real case. Detected by
  step 2 returning a clean worktree with no commits. Report as `nothing produced`,
  keep the worktree, do not auto-retry.
- *Agent waiting on a question* — reads as `idle` with a clean worktree, identical on
  the Git axis to "nothing produced," but the right action is replying in the pane,
  not harvesting. The pane tail (step 3) is what disambiguates; `collect` must show
  it before labeling the task, never after.
- *`git worktree add` fails* — most commonly because the task branch is already
  checked out in another worktree, or stale worktree metadata is present. Surface the
  Git error verbatim and suggest `git worktree prune`; do not retry with `--force`.
- *Broken worktree* — the directory exists but is not a git worktree, the residue of
  a `worktree remove` that deleted `.git` and then lost the directory itself to a
  Windows lock (seen live). Git truth is unreadable there. `collect`/`land` report it
  and point at `abandon`; `abandon` deletes an empty leftover directly, and one with
  contents only under `--discard` — it cannot prove the contents hold no work.
- *Blocked on the folder-trust prompt* — every first launch in a fresh scratch
  worktree hits the harness's "do you trust this folder" dialog. Herdr reports it as
  `blocked` and `status` flags it; the answer is one
  `herdr agent send-keys <pane> enter` from the human or main agent. Expected on
  every dispatch, not an error. (M4's skill should encode this.)
- *`local` mode endgame* — after the human merges the local branch, someone must
  still remove the worktree. `land` in `local` mode marks the task `landed` but keeps
  the worktree; a later `abandon` (which sees no unlanded work once the branch is
  merged) is the cleanup path.
- *Herdr server restarted* — workspace/tab/pane IDs survive, but agent processes and
  registrations do not. A tab whose pane exists with no registered agent is a husk;
  it can be closed and replaced, but only after Git state is read.

### 5.7 `status.mts` — the one-shot fleet sweep

The review's one "minimum viable liveness" keep, and it earns its place: §1's stated
problem is "remember which of the six open tabs was doing what three days later," and
`collect <task-id>` alone can't answer that — you'd need to already know the id.

`status` iterates `tasks.json` and prints one line per live task: task id, project,
harness, Herdr agent state (`busy`/`idle`/`blocked`), and whether the worktree has
uncommitted changes or unlanded commits. `blocked` tasks are flagged loudly — that's a
permission dialog waiting on a human. One command, on demand, no daemon, no polling.

## 6. The OpenViking boundary

Firstmate stores captain preferences in a flat gitignored `data/captain.md` because it
must run under any harness with no MCP assumptions. That constraint doesn't apply to
the main Claude Code session, which already has OpenViking with per-project scoping and
automatic semantic recall.

**Split the responsibility by who reads it:**

- **Preferences, working style, accumulated project knowledge → OpenViking.** These are
  read by the *main agent*, in an MCP-equipped session, when planning a dispatch.
- **Dispatch-time facts → `projects.json` + `tasks.json` on disk.** These are read by
  *the dispatcher*, which may run from a bare shell with no MCP server in reach.

The bite, stated plainly: if project defaults (harness, base branch, scratch root) live
only in OpenViking, `dispatch.mts` cannot run outside a Claude Code session — and a CLI
that only works from inside one agent is a worse CLI. **Anything the dispatcher needs
to execute must be on disk.** OpenViking holds the judgment; the files hold the facts.

## 7. Milestones

**M1 — dispatch works.** `harness.mts`, `herdr.mts`, `brief.mts`, worktree creation
with the double isolation assertion, `tasks.json` write. One harness (claude). Success:
one command puts a working agent in a fresh Herdr tab on a fresh worktree of a project
outside the cwd.

**M2 — collect works.** `collect.mts` steps 1–4, plus `land` and `abandon` with the
unlanded-work refusal, plus the `status` sweep (§5.7). Success: full round trip,
worktree cleaned up, nothing orphaned, and `status` accounts for every open task.

**M3 — multi-harness.** Fill the adapter table for codex, grok, pi. Each entry gets a
live verification pass and a dated note.

**M4 — main-agent skill.** DELIVERED 2026-08-05 as `skills/lif-dispatch/SKILL.md`
(repo root, so `npx skills add alandy88/lif-agents` finds it): when to dispatch versus
do it inline, how to write the `{TASK}` section, the trust-prompt unblock, and the
harvest procedure. Note filing into `lif-notes` is still manual.

## 8. Open questions

**Q0 — RESOLVED: independent review completed 2026-08-05.** Run by a Fable subagent
from a session rooted in `lif-agents` (the earlier attempt was blocked by Firstmate's
own PreToolUse guard). Verdicts, all folded into the sections above:

1. *No-supervision cut*: clean, with one keep — a one-shot `status` sweep (§5.7),
   since §1's "which tab was doing what" problem is unanswerable by `collect` alone.
2. *§5.6 completeness*: five gaps, all now in §5.6/§5.5 — behind-base/push-conflict
   detection on `land`, the agent-waiting-on-a-question case, `worktree add` failure
   and branch-accumulation-on-abandon, store write atomicity, and the `local`-mode
   worktree endgame.
3. *TypeScript vs PowerShell*: TypeScript confirmed; each of §4.2's three arguments
   is sufficient alone. One fix: the brief's `pwd -P` assertion wasn't shell-agnostic
   (§5.4).
4. *OpenViking split*: the split itself is right; the real bite was `projects.json`
   being committed with machine-local absolute paths, contradicting `AGENTS.md`'s
   environments rule. Now gitignored with a committed example (§5).
5. *Cut-list regrets at N=3*: the `status` sweep (kept), and the kimi
   `pointer-after-ready` delivery quietly rebuilding the cut ANSI composer (kimi
   dropped, §5.1). The rest of the cut list will not be missed.

The review also endorsed §5.2's refuse-don't-guess placement rules as the strongest
part of the PRD — keep them verbatim through implementation.

**Q1 — `local/` placement.** `local/` is currently terminal configuration absorbed from
`lif-terminal`. Is a first-class executable tool welcome there, or does this warrant a
third top-level half? Placement affects the Bun-copies-everything hazard and the
release gate (a `local/` change never tags a release, which is the desired behavior
here).

**Q2 — Worktree scratch root.** Machine-specific, so it belongs in the
`local/environments/<machine>/` overlay per the repo's own rule. Which overlay file
carries it — a new key in `lif-host.ps1`, or a `lif-dispatch` config of its own?

**Q3 — RESOLVED: live end-to-end round trip on `windows-5090`, 2026-08-05.**
Dispatch → trust-prompt approval → agent commit → collect → land (local) → abandon,
twice. Paths resolved correctly end to end (scratch root `C:\Users\peter\.lif-worktrees`,
claude verified `git rev-parse --show-toplevel` against the brief's path and proceeded).
Three implementation facts came out of it, all folded in above: brief delivery is a
one-line file pointer (§5.1), abandon closes the tab before removal and retries the
removal (§5.6 step 5), and the broken-worktree + trust-prompt entries in §5.6's
failure list. The `--session` flag position (leading) also verified against the live
server.

**Q4 — RESOLVED: nothing in `remote/` to reuse.** Read on 2026-08-05: `profiles.mts`
is pure model/effort routing for CI phases (plan/task/review) across exactly two
providers, resolving GitHub labels to model profiles; `run.mts` scaffolds sandcastle
sandboxes; and all actual flag construction lives inside `@ai-hero/sandcastle`'s
`claudeCode()`/`codex()` wrappers — headless sessions, not interactive TUI launches.
`harness.mts` gets written fresh. At most, mirror the `Effort` union
(`low | medium | high | xhigh`) as a type — duplicated, not imported, per the repo's
"share nothing but the repository" rule.
