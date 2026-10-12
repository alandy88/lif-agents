# Plan: the factory as a Claude Code mod

Status: draft, not approved. Written 2026-10-12. No code exists yet.

Scope: complex. It replaces a 475-line orchestration skill with code, touches
three plugins' wiring, and rests on engine calls this repo has not used before.

Evidence labels: **[verified]** means read in a file this session, with the
source named. **[unverified]** means inferred, and a phase below must prove it.

## Goal

Today `/factory` is a skill: the session's model reads
`plugins/lif-workflow/skills/factory/SKILL.md` and plays orchestrator. Every
gate in it (run the Checks command, read `Land` from the base branch, never
resume the builder mid-round, stop after `MAX_RESUMES`) holds only because the
model follows the text.

As a mod, code is the orchestrator. The model still does all the judgment work
inside the eight `factory-*` agents; it stops deciding what runs next.

Done means: one job runs from feature to `merged` or `needs-human` under the
mod with no orchestrator turns from the model except the PR landing, and the
skill is deleted.

## What the engine gives us

| Need | Call | Evidence |
| --- | --- | --- |
| A `/…` command | `$.command.register` in `session.start`, answered by a `command.run` hook | **[verified]** `plugins/lif-effort/hooks/register.tsx:471`, `:571` |
| Start an agent in a worktree | `$.agent.spawn({ subagentType, prompt, name, cwd })`, resolves at start with `agentId` | **[verified]** `AgentSpawnArgs` in the engine types; `register.tsx:436` |
| Know an agent finished | a `turn.complete` hook where `e.agentId` matches | **[verified]** `register.tsx:489-495` |
| Run git | `$.process.run(argv, { cwd, timeoutMs })`, 30 s default, 10 min hard cap, repo hooks off | **[verified]** engine types, doc of `process.run` |
| Run the Checks command | `$.process.spawn({ argv, cwd })`, a stream with no timeout field | **[verified]** type has no timeout. **[unverified]** that a run over 10 minutes survives |
| Ask the user | `$.ui.ask(question, options)`, rejects under `claude -p` | **[verified]** engine types |
| Block a tool call | `on('tool.call', { tool }, hook)` returning `{ deny }`, event carries `agentId` | **[verified]** engine types and `reference.md` |
| Hide agents from the model | `agent.offer` hook returning `{ isOffered: false }` | **[verified]** `reference.md` |
| Start a model turn | `$.prompt.submit({ text })`, queued until the session is idle | **[verified]** `register.tsx:406`, `reference.md` |
| A live board | `$.ui.open` plus a `ui.render` hook on `Pane` | **[verified]** skill table, `examples/pane.tsx` |
| Survive a reload | `$.state` keeps values; module variables do not | **[verified]** `reference.md` |

The engine types are those of build 2.1.296. The mod API is new and may move.

## Design

### Event-driven, one step per event

No hook runs long. `$.agent.spawn` resolves when the agent starts, not when it
ends, so the loop cannot be one long `await`. Every transition does the same
four things: read `job.json`, take one step, write `job.json`, return.

```
command.run            ──┐
turn.complete(agentId) ──┼──▶ step(job, event) ──▶ { job', effects[] } ──▶ run effects
checks stream ended    ──┤        pure                                      spawn agent
answer from $.ui.ask   ──┘                                                  run process
                                                                            ask user
                                                                            submit prompt
```

`step` is a pure function. It holds every rule now written as prose: which
lenses run in round N, `MAX_RESUMES`, the all-PASS test, the escalation
messages. It is tested without the engine. The effect runner is the only code
that touches `$`.

### State

`job.json` on disk stays the source of truth, in today's format, so
`dashboard.html`, parallel sessions and old jobs keep working. Two new fields:

- `owner`: the session id, so a session only advances jobs it started.
- `agents`: `{ "<agentId>": "<role>" }` for agents still running, so a
  `turn.complete` after a module reload still finds its job.

**[unverified]** `dashboard.html` ignores unknown fields.

### Files

A new plugin, laid out like `plugins/lif-effort/`:

```
plugins/lif-factory/
  .claude-plugin/plugin.json
  hooks/hooks.json          { "modules": ["./register.tsx"] }
  hooks/register.tsx        wiring: command, turn.complete, guards, pane
  hooks/machine.ts          step(job, event), pure
  hooks/effects.ts          runs effects through $
  hooks/board.tsx           the pane (phase 4)
  types/index.d.ts          $.state contract
  tests/machine.test.ts     plus world.ts, as lif-effort has
  tsconfig.json
```

Its checks are the mod's own three: `claude plugin validate`,
`claude plugin test`, `bunx tsc -p`. Nothing is added to the root
`package.json`, per this repo's `## Factory` section.

### Where the model is still needed

| Step | Why | How the mod handles it |
| --- | --- | --- |
| Setup of a fresh worktree | Today the model reads AGENTS.md prose and works out the commands | No new line. The builder's round 1 prompt gains "Run the setup AGENTS.md gives for a fresh checkout first." The builder already reads AGENTS.md, and the Checks gate catches a setup that failed. |
| Bootstrap step 5, drafting missing AGENTS.md lines | Pure judgment | Not ported. The mod stops and names the missing line. |
| Landing by PR | `pr-shepherd` is a skill | `$.prompt.submit` a turn that runs it in the worktree. The mod then reads `gh pr view --json state` on each main `turn.complete` to set `pr-open` or `merged`. |
| Resuming the builder with its memory | Needs `SendMessage` | Always spawn fresh with the skill's existing fallback prompt (`SKILL.md:279-283`). |

The `## Factory` contract does not change. A separate `Setup:` line was
considered and dropped: the only project with a `## Factory` section today
(this repo) already starts its `Checks` line with the install step.

### Guards

Written as gating hooks with `.catch`, as `reference.md` requires.

1. `git push` in a Bash call from any agent in a job's `agents` map: denied.
   Pushes happen only in the landing turn.
2. Write or Edit on any `jobs/*/job.json` from any `agentId`: denied.
3. `agent.offer` for the eight factory types: not offered. Last phase only,
   since the skill needs the model to spawn them until it is deleted.

One guard is lost and must be rebuilt. The `lif-workflow` safety hook asks
before any branch delete, but it is a Bash tool hook, and the mod's own
`$.process.run` is not a tool call. **[unverified]** So the mod calls
`$.ui.ask` itself before `git branch -d`, before a `Land: merge`, and before
any push.

## Decisions

1. **New plugin, not a module inside `lif-workflow`.** `lif-workflow`'s
   `hooks/hooks.json` holds shell hooks; whether one file can also carry
   `modules` is unverified, and this repo already keeps mods separate.
2. **Agents move last.** While the skill exists the mod spawns
   `lif-workflow:factory-*` across plugins. **[unverified]** that a mod may
   spawn another plugin's agent type. If not, move the eight files into
   `plugins/lif-factory/agents/` in phase 1 and rename them in the skill's table.
3. **Command name.** A skill and a mod cannot both own `/factory`. Build as
   `/factory-next`, decided by Peter on 2026-10-12. It keeps that name after
   the skill is gone. Its subcommand `next` reads `/factory-next next`.
4. **Second-model review is not ported.** It is disabled today. The mod writes
   the `SKIPPED` stub so each round folder still holds five files.

## Alternatives

| Option | For | Against |
| --- | --- | --- |
| A. Full mod (this plan) | Gates are forced. No orchestrator tokens. One session could run several jobs. | Most code. Rests on a new API. Prose is easier to change than a state machine. |
| B. Skill stays, small mod adds guards and the pane | A fraction of the work. Closes the "asked, not forced" gap for pushes and `job.json`. | The Checks gate and round limits stay on trust. |
| C. Leave it | Zero work | Nothing changes |

A is what was asked for. B is the fallback if phase 1 fails, and phase 3 is
B's content, so that work is not lost either way.

## Phases

Each phase ends with a real job on a scratch repo, not only passing tests.

**Phase 1: thin slice.** `/factory-next <feature>`: bootstrap steps 1 to 4,
create job and worktree, spec writer, builder, Checks gate, the code reviewer
only, approver, then always `needs-human`. It must answer:

- Does a subagent's `turn.complete` reach the hook while the session is idle?
- Can a mod spawn `lif-workflow:factory-builder`, with `cwd` set?
- Does a `$.process.spawn` child outlive the hook that started it, with a
  readable exit code, past 10 minutes?
- Do `$.process.run` git commands skip permission prompts and tool hooks?

Any "no" here stops the plan and falls back to option B.

**Phase 2: the full loop.** Four lenses spawned together, stubs, resume and
`MAX_RESUMES`, retro, `next`, `approve`, `rework`, one status line per
transition. **[unverified]** four spawns from one hook run in parallel.
`next` cannot claim a backlog line the way the skill does (an Edit that fails
when the line changed): `$.fs` has no compare-and-swap. Claim with a `mkdir`
that fails if the folder exists, as job ids already do.

**Phase 3: guards.** The two `tool.call` guards and every `$.ui.ask` point.

**Phase 4: landing and the rest.** PR handoff, local merge, base-sync, cleanup,
split jobs from `references/tickets.md`, the pane. Until then a split job stops
and tells the user to use the skill.

**Phase 5: retire the skill.** Move the eight agents into the mod, add the
`agent.offer` guard, delete `skills/factory/`, add the entry to
`.claude-plugin/marketplace.json`, fix the factory sentence in
`plugins/AGENTS.md`, bump both plugin versions.

## Tests

`tests/machine.test.ts` covers every branch of `step`, one test each:

- happy path to `approve`
- `STATUS: BLOCKED` to `needs-human`
- Checks fail with resumes left, and with none
- round 2 runs only the `CHANGES` lenses plus `code`
- `Pages: none` skips `ux` and `ui`
- `CHANGES` on the third round escalates with the exact message
- a reviewer that writes no verdict stops the job
- rework resets the resume count and runs the full lens set
- base moved: clean merge, and conflict

The guards get one test each in `tests/guards.test.ts`.

## Pre-mortem

1. **The API moves.** The mod breaks on a Claude Code update, and the skill is
   gone. Mitigation: phase 5 waits until the mod has run real jobs for a week;
   the skill stays in git history.
2. **A lost event strands a job.** A reload or crash drops a `turn.complete`,
   and the job sits in `build` forever. Mitigation: `agents` in `job.json`,
   plus `/factory-next resume <job-id>` that re-reads the files on disk and
   takes the next step.
3. **The mod acts where the model used to ask.** Commands run without a
   permission prompt. Mitigation: the `$.ui.ask` points in Guards, and no
   write to the main checkout except `Land: merge`.

## Not in this plan

- Several jobs in one session. The design allows it; nothing builds it.
- Any change to what the eight agents do.
- Codex. It already stops at this skill (`SKILL.md:11-12`).

## Open questions for Peter

1. Where does this plan live once approved: the vault's `system/plans/`, or a
   GitHub issue on this repo?
