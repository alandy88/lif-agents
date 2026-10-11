# Software factory in `lif-workflow`, replacing `/shipit`

Status: draft. Nothing is built. Decided so far: plugin-level (2026-10-10), bootstrap
drafts missing `AGENTS.md` lines (D1), the factory replaces `/shipit`.
Open: D4.

Source: `zazencodes/zazencodes-season-3`, `src/software-factory-claude-code/` (read
2026-10-10). One skill (`/factory`) with four commands, seven subagents, markdown job
files, one HTML dashboard. Its loop, as written there:

```
feature → spec-writer → builder → [security, ux, ui, code] → WAIT FOR ALL
                           ▲                                      │
                           └──── any CHANGES: resume builder ◄────┤
                                                                  ▼ all PASS
                                     merge to main ◄─ APPROVE ─ approver ─ ESCALATE → needs-human
```

This plan's loop. It differs in two places: a retro step before the approver, and
"land" (D2) where the source merges to `main`.

```
feature → spec-writer → builder → [security, ux, ui, code] → WAIT FOR ALL
                           ▲                                      │
                           └──── any CHANGES: resume builder ◄────┤
                                                                  ▼ all PASS
                                                                retro
                                                                  ▼
                                              land ◄─ APPROVE ─ approver ─ ESCALATE → needs-human
```

## Kept from the source, unchanged

The plugin copies the source's skill and agent files and applies only the changes
listed under "Changes to the spec's files". Everything else stays, in particular:

- **The four commands** (see Commands below).
- **One file per agent.** Agents get context from files, not the conversation, and
  each writes exactly one file in the job folder. The builder also commits.
- **First-line contracts.** `build.md` starts `STATUS: READY` or `STATUS: BLOCKED`,
  each review `VERDICT: PASS` or `VERDICT: CHANGES`, `decision.md` `APPROVE` or
  `ESCALATE`.
- **WAIT FOR ALL.** Four reviewers spawned in one message; a round is done only when
  all four files exist; the builder is never resumed mid-round.
- **`MAX_RESUMES = 2`**, so at most 3 review rounds. When they run out the
  orchestrator writes the `ESCALATE` `decision.md` itself.
- **`job.json`**: the source's fields, rewritten whole on every change, written only by
  the orchestrator. This plan adds `base`, three ports, and the stage `pr-open`.
- **Claims.** A job id is the next 3-digit number plus a slug, claimed by `mkdir`
  without `-p`. A backlog item is claimed by one Edit of its exact line.
- **The approver's checks and escalation list**, and each agent's `tools` and `model`.
- **Needs human** leaves the branch and worktree in place.
- **One report line per transition.**

## Commands

All four are the source's.

| Command | Here |
|---|---|
| `/factory <feature>` | As the source, after the bootstrap step below |
| `/factory next` | As the source. `backlog.md` is in the sibling folder, not the repo |
| `/factory approve <job-id>` | The job must be `needs-human`. Runs Land (D2) where the source runs Merge. Typing it is the owner's yes to push that one job, so the `Land` question is not asked again |
| `/factory rework <job-id> <note>` | As the source: the job must be `needs-human`; the note goes verbatim to `rework-<k>.md`; a fresh builder reads it with `build.md` and every round folder; the run gets a fresh `MAX_RESUMES` and continues from Build check |

## Why a plugin, and why it works in every project

`lif-workflow` already ships this shape for `/shipit`: a skill with bundled assets,
namespaced role agents, run state outside the working tree, and `pr-shepherd` for
landing. The source's README says of `AGENTS.md` (or `CLAUDE.md`): "The agents carry
nothing repo-specific; they read all of it from there." So one copy serves every
project.

A mod in the `lif-effort` sense (function hooks, panels) is not needed: nothing here
hooks a tool call. The handoff in `lif-agents/HANDOFF.md` already settled that a mod
should not own orchestration.

## Replacing `/shipit`

No `/shipit` run is in flight. All five `lif-workbench` runs have merged PRs (#46, #47,
#49, #50, #56); two `plan.md` files still read "Gate 2: pending" and are stale.

The audit of 8 past `/shipit` runs (in `lif-agents/HANDOFF.md`, untracked) says which
stages earned their place. The spec's factory, taken as written, would drop the two
strongest. This plan carries them over.

| `/shipit` stage | Audit verdict | In the factory |
|---|---|---|
| Breaker | Keep. 92 findings, a high in 7 of 8 runs | **Dropped, by the owner's decision (2026-10-10).** The four lenses and the Codex bot on the PR are what remain |
| Tester | Keep | Folded in. The spec-writer asks for a test per acceptance criterion and the builder writes it (change 9). The code lens flags tests that only restate the code. The ux lens runs the app |
| Findings Tester | Fold away | Gone; the review loop is that pass |
| Reviewer | Weakest | The spec's code lens. It reports; the builder fixes |
| Retro | Keep the repo `AGENTS.md` edits. 13 issues proposed, none approved | **Added:** a retro step before the approver. Repo `AGENTS.md` edits only. No issue or vault proposals |
| Gate 2 (PR approval) | Keep. Carried real decisions | Kept by landing through `pr-shepherd`, which asks before merging (D2) |
| Gate 1 (plan approval) | Keep. Approved every time | **Dropped.** The approver escalates when a spec assumption is a product decision |
| Waves of slices on one branch, one PR | Keep. Used in 2 of 8 runs, at most 3 slices at once | **Open, D4** |
| Retries, conflict subagent | Never used | Gone |

The audit also found the Codex bot raised P1/P2 issues on all 6 merged PRs it could
check. That is the case for landing by PR, not by local merge.

Two issues past retros proposed against `/shipit` are met here by design: install
dependencies when creating a worktree, and wait properly on long post-commit hooks.

## Shape

```
lif-agents/plugins/lif-workflow/          the factory itself, one copy for all projects
  skills/factory/SKILL.md                 orchestrator, disable-model-invocation: true
  skills/factory/assets/dashboard.html    the spec's file, one stage added (pr-open)
  agents/factory-spec-writer.md           opus
  agents/factory-builder.md               opus
  agents/factory-reviewer-security.md     opus
  agents/factory-reviewer-ux.md           sonnet
  agents/factory-reviewer-ui.md           sonnet
  agents/factory-reviewer-code.md         sonnet
  agents/factory-retro.md                 sonnet, edits AGENTS.md only
  agents/factory-approver.md              opus

<parent>/<name>-factory/                  one project's runtime state, beside the project
  dashboard.html                          copied from the plugin on first run
  backlog.md                              queue for /factory next
  jobs/<job-id>/                          job.json, spec.md, build.md, rework-<k>.md,
                                          round-N/, retro.md, decision.md
  worktrees/<job-id>/                     the job's checkout, on factory/<job-id>

<project>/AGENTS.md                       what only the project knows
  (existing setup and check commands)     required
  ## Factory                              optional: page recipe, hot spots, escalation list
```

Agents keep the `factory-` prefix for good. `builder` and `reviewer` are taken by
`/shipit` until it is removed, and a rename afterwards buys nothing. They are called as
`lif-workflow:factory-*`. Each sets its own `model`, so the orchestrator passes none.

## Bootstrap: step 0 of every `/factory` call

No install step. Each call starts by making sure the project is ready, and is silent
when it already is.

1. Find the main checkout: the parent of
   `git rev-parse --path-format=absolute --git-common-dir`. This holds from inside a
   worktree too.
2. `mkdir -p <parent>/<name>-factory/{jobs,worktrees}`. Copy `dashboard.html` from the
   skill's `assets/` when absent. Create an empty `backlog.md` when absent.
3. Resolve the base branch with `git symbolic-ref --short refs/remotes/origin/HEAD`.
   Store it in `job.json` as `base` and pass it to every agent. The spec hard-codes
   `main`. Of the 12 repos under `personal/`, 4 use `master` (`ComfyClaw`,
   `slack-bot-blue-print`, `ai-gateway`, `lif-notes`) and `fantasy-image-skills` has no
   `origin/HEAD`. When it does not resolve, stop and ask.
4. Readiness check. Read the project's `AGENTS.md`. It must say how to set up a fresh
   checkout and which commands must pass. When either is missing, go to step 5. A
   project with pages and no page recipe still runs; the builder and the two page
   reviewers, the three agents the source has open pages, then work by reading only and
   say so. The same holds when `which agent-browser` finds nothing.
5. **Draft the missing lines (D1, decided).** Work the commands out from the repo:
   package and lock files, CI config, hooks, existing scripts. Show the exact lines as a
   diff and wait for a yes. A job's worktree is cut from the base branch, so lines left
   uncommitted in the main checkout would be invisible to every agent. The yes therefore
   covers both writing the lines and committing that one file on the base branch, staged
   by its path, never pushed. If the main checkout is not on the base branch, or
   `AGENTS.md` already has uncommitted edits, stop and say so. On a no, stop.

Where step 5 will fire today, by a rough keyword scan of each `AGENTS.md` on 2026-10-10:

| State | Repos |
|---|---|
| Names both setup and checks | `lif-workbench`, `lif-studio`, `comfyui-lif-nodes`, `ComfyClaw`, `dsh-lif-plugins` |
| Names one | `slack-bot-blue-print`, `lif-agents` |
| Names neither | `qa-portal`, `ai-gateway`, `lif-comfy-agent`, `lif-openclaw-agents`, `lif-notes`, `fantasy-image-skills` |

The scan matched headings and install commands; treat it as a guide, not a verdict.
`lif-notes` and `fantasy-image-skills` are not code targets anyway.

## The `## Factory` section in a project's `AGENTS.md`

Optional. It holds only what the general checklists cannot know. Every factory agent
reads `AGENTS.md` and this section when present.

```markdown
## Factory

- **Pages:** how to serve the app from a worktree on a given port, with safe data.
  Or "none".
- **Watch for:** review hot spots for this codebase.
- **Always escalate:** changes a human must see before they land.
- **Land:** `pr` or `merge`. Absent: ask before each push. See D2.
```

## Decisions

### D1. An unready project — decided: draft, show, write on a yes

See bootstrap step 5. The cost accepted: a wrong guess at a setup command becomes a
tracked line in a project's `AGENTS.md`. The shown diff and the builder's `BLOCKED`
status are the two checks on it.

### D2. How an approved job lands

The spec merges `--no-ff` into the main checkout, which must be clean and on the base
branch. No project's main checkout can be assumed clean; this one carried 29 modified
files on 2026-10-10. Recommended: land by PR through `pr-shepherd`, which is in the same
plugin. CI and the Codex bot review then apply. `pr-shepherd` asks before merging, so
every job has one human gate, the same one `/shipit` had as Gate 2. Stage `pr-open`
replaces `merged` until the PR merges.

This drops the spec's "Never push" rule. A push is visible to others, and here no human
stands between the approver, which is a model, and the push. The plugin's
`pre-bash-check` hook lets a plain push through and asks only on a force push, so
nothing else stops it. Approving this plan is not a standing yes. The project's `Land`
line is:

| `Land` line in the project's `AGENTS.md` | On APPROVE |
|---|---|
| absent | stop and ask once per job: "push `factory/<id>` and open a PR?" |
| `Land: pr` | standing yes: push, then run `pr-shepherd` |
| `Land: merge` | the spec's behaviour: local merge, never push, clean tree required, no human gate unless the approver escalates. Skips CI and the Codex bot |

### D3. Where runtime state lives

1. **Beside the project, in `<parent>/<name>-factory/` (recommended).** The spec already
   puts worktrees there. One visible folder per project; deleting it removes everything.
   No `.gitignore` edit.
2. **Inside `.git`, at `<git-common-dir>/factory/`, as `/shipit` does.** Invisible, but
   the plugin's own `pre-sensitive-check` hook asks permission on every Edit or Write
   under `.git/`. Eight agents writing a file each would stop on a prompt each time, so
   this needs a hook exception first.

### D4. A feature too big for one job (open)

`/shipit` split a feature into slices, built a wave of them side by side against pinned
interfaces, merged them on one integration branch, and opened one PR. The factory's unit
is one job, one branch, one PR.

1. **One job per slice (recommended).** Plan the feature with `structured-planning`,
   write each slice as a backlog line in dependency order, run `/factory next`. Slices
   that share nothing run in separate sessions at once. A slice that needs an earlier
   one starts after that PR merges. Nothing new to build. Cost: several PRs per feature,
   and no check of the slices together beyond CI on the base branch. With `Land: pr`
   each merge waits on the owner, so a chain of three dependent slices is three merges
   by hand, one after another, before the feature exists.
2. **One big job.** Give the whole feature to one builder. Simplest of all, but a large
   feature crowds one builder's session, which is why `/shipit` sliced.
3. **Port waves into the factory.** An integration branch, slice jobs under it, one PR.
   Keeps everything `/shipit` did. It is most of `/shipit` rebuilt, and the audit found
   waves used in 2 of 8 runs.

The rest of this plan assumes option 1.

## Changes to the spec's files

All generic. No project name appears in the plugin.

1. **Paths.** Job folder and worktree move to the sibling folder above. `<paths>` gains
   `Base: <branch>.` Every `main` in the skill and agents becomes the base branch.
2. **Resuming the builder.** The source names the builder `builder-<job-id>` and resumes
   that same builder with `SendMessage` after each round. It is one of the source's
   written rules, and it stays wherever the session has `SendMessage`. The session this
   plan was written in (2026-10-10) has none: every Agent call starts fresh and takes
   no name. There, and only there, the orchestrator spawns a fresh `factory-builder`
   with the source's resume message plus "read `spec.md`, `build.md` and every round
   folder first", the read list the source already gives a rework builder. Cost of the
   fallback: the fresh builder has no memory of the code it wrote beyond `build.md`'s
   Log. `MAX_RESUMES = 2` counts both kinds.
3. **Ports.** The spec's `5100 + 10n` repeats across projects, since each project numbers
   its jobs from 001. The orchestrator asks the OS for three free ports per job and
   writes them to `job.json`.
4. **Builds for pages happen once.** The two page reviewers run at once in one worktree.
   The builder does any build step before `STATUS: READY`; the two page reviewers only
   start a server.
5. **Long commit hooks.** A foreground Bash call here stops at 10 minutes. The builder
   runs `git commit` in the background when a hook is slow, waits, and reads its output.
   A failed hook is a failed validation. Hooks are never bypassed; the plugin's
   `pre-bash-check` blocks that anyway.
6. **Agents read the `## Factory` section.** One line in each agent's "Read" list.
7. **Landing.** The Merge step becomes Land, per D2, for both an `APPROVE` and
   `/factory approve`. After a merge, by PR or locally, the source's cleanup runs:
   remove the worktree, delete the branch, set `stage: "merged"`.
8. **Claude only.** Codex gets plugin skills by symlink but not the agents. The skill's
   first line says it needs Claude Code and the Agent tool. The skill also gains
   `disable-model-invocation: true`, as every orchestrating skill in this plugin has;
   the source's skill has no such line.
9. **Tests.** The source already routes tests through the spec: its spec-writer is told
    "Ask for new tests only if the repo has a test runner", and its builder verifies
    each criterion and records evidence. This plan tightens that one line from "may" to
    "must": where the repo has a test runner, the spec-writer asks for one test for each
    acceptance criterion that no existing test pins. The builder is unchanged; it
    builds what the spec asks. The code lens gains one check: flag tests that restate
    the code or duplicate another.
10. **Retro.** The one step the source does not have. After a round of all PASS and
    before the approver, the orchestrator sets `stage: "approve"` and dispatches
    `factory-retro` into the worktree. It reads what the job already wrote: `build.md`'s
    Log and every review's Findings and Notes. It commits repo `AGENTS.md` edits on the
    job branch and writes its one file, `retro.md`: each edit with its evidence, or
    "None." The approver then reads a diff that includes them. No other agent changes
    for this, so the source's one-file rule holds and no shared `learnings.jsonl` is
    needed. The source's spec-writer already requires the `AGENTS.md` updates a change
    needs and its code lens checks them; the retro adds only gotchas met during the
    run. The rules live in the agent file, as the other roles' do since `lif-agents`
    commit `2536dd9`: the `retro` skill has `disable-model-invocation: true`, and
    whether a subagent can invoke such a skill is listed as unverified in
    `lif-agents/HANDOFF.md`.
11. **Dashboard.** Add `pr-open` to its `STAGES` list; the page reports any stage it
    does not know as a problem. Nothing else changes: it lists every `.md` in a job
    folder, so `retro.md` shows up on its own, and it finds `jobs/` beside itself, which
    the sibling folder keeps true.

## Work

### A. Build the factory in `lif-agents` (one PR; `/shipit` untouched)

1. Add `skills/factory/` and the eight `agents/factory-*.md`, with the changes above.
2. `factory-retro.md` takes its rules from `skills/retro/SKILL.md`: drop notes without
   evidence, dedupe, repo `AGENTS.md` edits only. Its input is the job folder, not a
   `learnings.jsonl`. Evidence is a review's `path:line`, or a command and its result
   in `build.md`. The skill itself is left alone.
3. Bump `version` in `plugins/lif-workflow/.claude-plugin/plugin.json`. Without it,
   installed copies never see the change.
4. `plugins/AGENTS.md` and `plugins/docs/skill-naming-convention.md`: add `factory` and
   its agents.
5. Iterate with `claude --plugin-dir ./plugins/lif-workflow` from a target project.
6. Evals: `plugins/evals/skills/` has entries for 4 skills and none for `shipit`. Add
   none.

### B. `lif-workbench`, the first project (one small commit on `main`)

Add `## Factory` to `AGENTS.md`. It must be committed before the first job, for the
reason in bootstrap step 5.

- **Pages:** the builder runs `bun run build` in `apps/workbench-lite/web`. A server is
  `uv run uvicorn serve:app --port <port>` from `apps/workbench-lite`, under
  `env -i HOME PATH` with fixture roots, `WB_AGENT_URL` at a dead port and
  `COMFYUI_OUTPUT_ROOT` unset, as `docs/guides/testing.md` "A second instance for a
  browser pass" describes. Never the live service on `:8765`. Stop it by saved PID.
- **Watch for:** subprocess calls in `lif-cli`; path confinement in `wb/core`
  (`confine`); anything reaching `client_send_wechat_*`; `CIVITAI_API_KEY`, which may
  travel only through the subprocess environment; no bench imports another bench;
  cross-repo pins are git tags; the UI is Chinese.
- **Always escalate:** WeChat send paths, cross-repo tag pins, `.env` or `.env.test`,
  `.githooks/`, CI config, a new dependency, an ADR reversal, SQLite schema.
- **Land:** `pr`, if the owner wants factory pushes here without being asked each time.
  Writing this line is the standing yes.
- A note that the post-commit hook runs about 9 minutes with `web/node_modules` present.

No `.claude/agents/`, no `factory/` folder, no `.gitignore` line, no architecture page.

### C. Prove it

1. `lif-workbench`, one CLI-only backlog item. Page lenses should return "no visual
   change".
2. `lif-workbench`, one web item.
3. `ComfyClaw`, one item. Proves a second project and a `master` base branch.
4. `qa-portal`: expect a drafted diff for `AGENTS.md` and a stop on "no".
5. One feature that would have been a `/shipit` run, as several jobs per D4.

Watch with `cd <parent>/<name>-factory && python3 -m http.server --bind 127.0.0.1`.

### D. Retire `/shipit` (second `lif-agents` PR, only after C passes)

1. Delete `skills/shipit/` and `agents/{builder,reviewer,breaker,tester}.md`.
2. `skills/retro/SKILL.md` is written around a `/shipit` run. Delete it with `/shipit`,
   or reword it to read a factory job folder if `/retro` by hand is still wanted.
3. `plugin.json` description, `plugins/AGENTS.md`, the naming doc: drop `shipit`. Bump
   the version.
4. `~/.claude/CLAUDE.md` names `lif-workflow:builder` as its example of an agent with
   its own model. It is the owner's private file; point it at `factory-builder`.
5. Leftovers in the projects, each needing the owner's yes because it deletes things:
   - `lif-workbench`: 6 worktrees `../lif-workbench-shipit-draft-upscale{,-1..-5}` and
     their `shipit/draft-upscale*` branches, from merged PR #56.
   - Run records under `.git/shipit/` in `lif-workbench` (5 runs) and
     `comfyui-lif-nodes` (3 runs). They are the audit's evidence and cost nothing.
     Recommended: leave them.
6. `lif-agents/HANDOFF.md` open issue 6 (possible `/shipit` trims) is then moot.

## Done when

- `/factory <feature>` in `lif-workbench` runs a CLI-only job end to end and lands per D2.
- The same in `ComfyClaw`, with `base: "master"` in its `job.json`.
- `/factory` in `qa-portal` shows drafted `AGENTS.md` lines and creates no job on "no".
- A deliberate reviewer CHANGES resumes the builder, or spawns a fresh one where the
  session has no `SendMessage`, and the job reaches round 2.
- An approver ESCALATE leaves the worktree in place and `stage: "needs-human"`.
- `/factory approve <job-id>` on that job lands it per D2.
- `/factory rework <job-id> <note>` on a `needs-human` job writes `rework-1.md` and the
  job reaches a new review round.
- `git status --porcelain` in each project shows nothing the factory wrote.
- After D: `grep -ri shipit plugins/lif-workflow` in `lif-agents` returns nothing, and
  `claude plugin validate plugins/lif-workflow` passes.

## Skipped on purpose

- No `lif-cli factory` verb. The loop is orchestration, not a tool.
- No mod, live panel, or cross-project dashboard. One HTML page per project.
- No dashboard restyle; the spec's file plus one stage column.
- No plan-approval gate (Gate 1). Add a `Spec gate` line to the `## Factory` section
  later if a run shows it is missed.
- No link to the `backlog` skill's Linear cards. `backlog.md` is a plain file.
- No hardening for parallel sessions beyond the spec's `mkdir` claim.
- No automated test of the skill; the runs in C are the check.

## Risks

- **Review reports, where `/shipit` fixed.** The Reviewer and Tester there changed code
  themselves. Here every finding costs a builder round, and there are at most 3 rounds.
  A job with many small findings can run out and go to `needs-human`.
- **No check of slices together.** Under D4 option 1, the Tester's integration pass has
  no equivalent. In the audit that pass caught "page never showed the switch".
- **No Breaker.** The audit counted 92 Breaker findings over 8 runs, with a high in 7.
  Nothing here reads the change cold to find how it breaks. Landing by PR keeps the
  Codex bot as the one outside check, so `Land: merge` is riskier than before.
- **One addition the spec does not have:** the retro step, from `/shipit`. It reads
  only files the other agents already write, so it can be cut without touching them.
  Its `AGENTS.md` commit lands after the four reviews; only the approver reads it.
- **Resume is untested here.** Which sessions have `SendMessage` is not known. The
  fresh-builder fallback is the path C will prove first.
- **Build during review.** The source's code lens runs the repo's build command while
  the two page lenses serve the same worktree. Change 4 does not cover that.
- A full job costs eight or more agent runs. In `lif-workbench` add a 9-minute hook per
  builder commit.
- Four lenses on a CLI-only change waste two reviewers. If C1 confirms it, the
  orchestrator skips `ux` and `ui` when the project's `Pages` line says "none" or the
  diff touches no page file.
- `dashboard.html` is served from a folder that also holds worktrees, so the local
  server exposes source. Bind it to `127.0.0.1`.
- The readiness check is a model reading `AGENTS.md`, not a parser. It can pass a thin
  file. The spec-writer and builder then write BLOCKED, which is the real backstop.

## Where this plan goes next

It spans `lif-agents` and `lif-workbench`. The vault's `system/plans/` admits a plan
only once implementation is under way (`status: implementing`); a draft belongs in a
GitHub issue in the owning repo. So: on approval, open an issue in `alandy88/lif-agents`
from this file, or move it to the vault when the build starts. Then delete this copy.
