# Software factory: what the community does, against our `/factory`

Researched 2026-10-11. Companion to
[../plans/2026-10-10-software-factory.md](../plans/2026-10-10-software-factory.md); that
plan's decisions are not re-argued here. Scope: how other people build multi-agent coding
pipelines, and the setup details for running several agents on one repo.

**How to read the evidence.** Pages marked *fetched* were read in full or in part on
2026-10-11. Pages marked *summary* were seen only as a search summary and are unverified.
Most parallel-agent sources are vendor blogs; the one rigorous source is the arXiv paper on
merge conflicts. No Reddit thread surfaced, so r/ClaudeAI and r/ClaudeCode are uncovered.
The source author's video was not watched.

## 0. What counts as a factory

Revised 2026-10-11, after the owner pointed out that several examples here are steered
agent workflows, not factories. Each example was rechecked against its own page.

**Definition.** A request goes in, and a landed or merge-ready change comes out, with no
person steering between the steps. People appear only at the edges: filling the queue,
the final merge, or an escalation. By that test our `/factory` is one: the human sits at
the merge question in `pr-shepherd` and at `needs-human`.

| Example | Class | Where the human sits | The line that settles it |
|---|---|---|---|
| zazencodes | Factory | Escalation only | "agents… merge it to `main` or hand it to you" |
| StrongDM | Factory | Writes specs and scenarios | "Code must not be reviewed by humans" |
| compound-engineering `/lfg` | Factory mode of a steered tool | Before and after the run | "`/lfg` runs the loop hands-off" |
| Stripe Minions | Factory | Reviews the finished PR | Humans review the PR only |
| Spotify Honk | Factory | Reviews the finished PR | A failed verifier means "the PR isn't opened" |
| Ramp Inspect | Factory | Reviews the finished PR | The author cannot approve the agent's PR |
| addyosmani/factory | Factory, to a draft PR | Owns the charter, does "every merge" | Stops "when that queue reaches your limit" |
| greynewell/claude-software-factory | Factory, fully unattended | Files the issue | "When CI is green and reviews pass, the PR gets merged" |
| falkobuttler/software-factory | Factory, to a ready PR | Labels the issue, merges | "AI reviewer checks the PR (up to 3 rounds)" |
| GitHub Copilot cloud agent | Factory, to a PR | Assigns the task, reviews the PR | One branch and one PR per task |
| Anthropic harness | Unattended build loop, not a factory | Tunes the evaluator between runs | No queue and no landing step |
| superpowers subagent-driven-development | Unattended stage inside a steered workflow | Makes the plan first, lands it after | "Do not pause to check in… between tasks" |
| freeCodeCamp "factory" | Steered workflow, despite its title | Three approvals per feature | "Never skip the human approval points." |
| compound-engineering, default | Steered workflow | Runs each step by hand | One command per step |
| Gas Town | Steered swarm | Drives the Mayor | Not refetched |
| spec-kit, BMAD | Steered workflows | Each phase | Never fetched, unverified |
| HN thread 47920020 | Unclassifiable | Not stated | Anecdote only |
| Ralph loop | Technique | n/a | A loop, with no gate or landing |
| Vincent's adversarial pair | Technique | n/a | A review prompt |
| Claude Code agent teams, claude-flow | Mechanism | n/a | Tooling, not a pipeline |

Of the 12 rows first compared in section 6.2, 3 were true factories. Sections 1 to 6.3
below were written before this check. Read every "community position" there as "what
agent workflows do", and see section 7 for what holds up.

## 1. Where our design stands

| Our choice | Community position | Verdict |
|---|---|---|
| Orchestrator never writes code | Same in superpowers and the freeCodeCamp factory. Anthropic: start with orchestrator-subagent, "the simplest pattern that could work" | Mainstream |
| One file per agent, context from files | Anthropic's harness post hands off through files. Ralph loop keeps all state in files | Mainstream |
| First-line `STATUS` / `VERDICT` / `APPROVE` contracts | Nobody else found has contracts this strict | Ours is tighter. Keep |
| Four lenses, WAIT FOR ALL, every round | More review per round than anyone but Every, and Every picks its reviewers from the diff | Heavier than the norm. See 3.3 and 3.5 |
| `MAX_RESUMES = 2`, then `ESCALATE` | Anthropic: "a maximum iteration limit with a fallback strategy". superpowers caps at 5, with a model step-up | Right shape, tighter than others |
| `CHANGES` only for blocking problems, taste under Notes | HN: hard-gate reviews caused "near infinite loops" from nitpicks | Already guarded. All four lens files carry the rule |
| Spec-writer with testable criteria | Common. StrongDM adds checks the builder cannot see | Missing the holdout idea. See 3.2 |
| Retro edits `AGENTS.md` | Every writes one file per learning to `docs/solutions/` and leaves only a pointer in `AGENTS.md` | Ours grows `AGENTS.md`. See 3.7 |
| Approver that can escalate | Rare. Fits the Ralph finding that the writing session must not declare itself done | Ahead of the norm. Keep |
| Breaker dropped | Every source with an opinion wants an adversarial or cross-model pass | Evidence sides with our audit, against the drop. See 3.1 |
| Worktree per job, state in a sibling folder | Worktree per task is the default. State goes in a gitignored `.trees/` or a sibling folder | Mainstream |
| OS-assigned free ports per job | Others hash the branch name into a port and do not handle collisions | Ours is safer |
| `mkdir` and exact-line Edit claims | Beads has an atomic `--claim` (vendor claim). Linear, Jira and GitHub Issues document none | Fine for one machine |
| One job per feature (D4 open) | Default is one branch or PR per task; never share a branch between agents. No measured evidence for waves | Our own audit (2 of 8 runs, at most 3 slices) is the best data there is. It does not argue for waves |

## 2. The approaches

Each entry carries its class from section 0. The factories found on the second pass are
at the end, under "Factories missed on the first pass".

**zazencodes software factory, our source.** Factory. The factory folder has one commit, `7f8a22b`
(2026-10-02). `555467c` (2026-10-07) only adds a video link, and nothing is newer, so our
copy is current. No issue or PR touches the factory. Written rationale, from its README and
`BUILD_PROMPT.md`: keep it small enough to grasp in minutes; agents get context from files;
the loop diagram is what you edit to change the factory; it moved from one shared
`board.json` to a `job.json` and worktree per job "so several jobs can run at once". The
README calls the review checklists "deliberately general" and says to tailor them to the
stack. `BUILD_PROMPT.md` makes resume-by-name the intended path. *Fetched.*
<https://github.com/zazencodes/zazencodes-season-3> · video
<https://youtu.be/ctoaIC4LHmI> (not watched)

**freeCodeCamp factory** (Qudrat Ullah, 2026-05-22). *Steered workflow.* Chain: researcher on a small model,
story-writer, spec-writer, backend-builder, frontend-builder, test-verifier, validator.
Three human gates: after the story, after the brief, before the PR. The validator reports
and never fixes; only critical findings loop back. No loop cap stated, no adversarial agent.
"Hooks matter because they cannot be argued with"; prompt rules are "guidance, not a hard
security boundary." *Fetched.*
<https://www.freecodecamp.org/news/how-to-build-software-factory-with-claude-code/>

**superpowers, subagent-driven-development** (obra). *Unattended stage inside a steered workflow.* Fresh implementer per task. One
reviewer returns two verdicts, spec then quality. A whole-branch review runs at the end and
allows one fix dispatch only. Cap of 5 fix rounds: rounds 1 to 3 resume the implementer,
rounds 4 and 5 use a fresh implementer on a stronger model. Re-reviews are scoped to the
fix. A finding that conflicts with the plan gets a "Ruling" logged in a ledger file; minor
findings are parked, not looped. Issue #1538 (May 2026) reports reviewers taking 20 to 33
minutes each from unscoped file reads. *Fetched.*
<https://github.com/obra/superpowers> · <https://github.com/obra/superpowers/issues/1538>

**Adversarial review prompt** (Jesse Vincent, 2026-05-01). *Technique.* Two competing subagents:
"whomever finds the largest number of serious issues gets five points." Many readers use
Codex to review Claude. *Fetched.* <https://blog.fsck.com/2026/05/01/adversarial-review/>

**compound-engineering** (Every). *Steered by default; `/lfg` is a factory mode.* Loop: brainstorm, plan, work, simplify, review, compound.
Review is report-only, multi-agent, checked against the plan, with the reviewer roster
picked from the diff. Learnings go to `docs/solutions/`, one file each, in the same PR.
*Fetched.* <https://github.com/EveryInc/compound-engineering-plugin>

**StrongDM software factory** (via Simon Willison, 2026-02-07). Factory. No human-written code, no
human-reviewed code. Scenarios are end-to-end user stories held outside the codebase like a
holdout set, so the builder cannot see them. The score is the fraction of scenario runs
that would likely satisfy a user, not a green suite. Heuristic of $1,000 in tokens per
engineer per day. Willison doubts both the cost and the no-review rule. *Fetched.*
<https://simonwillison.net/2026/Feb/7/software-factory/>

**HN, "Ask HN: dark factory"** (id 47920020, date unverified). *Unclassifiable: no poster says whether anyone approves between steps.* One setup: spec, a red team
writes tests, a green team builds seeing only which tests failed, then review. Failure
modes named: the implementer would "wiggle out by deferring things into oblivion", and
hard-gate reviews caused "near infinite loops" from nitpicks. Cross-model reviews gave
"appreciable results". An exploratory QA agent after review "discovers defects that the
'static' code reviews miss." *Fetched.* <https://news.ycombinator.com/item?id=47920020>

**Ralph loop** (2026-10-10). *Technique.* The same prompt in a shell loop, fresh context each pass,
state in files, tests as backpressure. In one experiment the code passed 28 tests, 13 of
them unseen, and a fresh no-tools review session still found a spec violation for $0.11.
The session that writes must not declare done or merge. *Fetched.*
<https://orbi.build/blog/ralph-loop-claude-code>

**Gas Town and beads** (Yegge; DoltHub write-up 2026-01-15). *Steered swarm.* Operational roles (Mayor,
Polecats, Witness, a Refinery merge queue) around a git-backed issue tracker, not judged
phase gates. DoltHub's day: about $100 in one hour, a PR merged with failing tests, a force
push to recover, all four PRs closed. *Fetched.*
<https://www.dolthub.com/blog/2026-01-15-a-day-in-gas-town/> ·
<https://paddo.dev/blog/gastown-two-kinds-of-multi-agent/>

**spec-kit, BMAD, claude-flow.** *Steered workflows and a toolkit.* Persona chains with phase gates. Complaints: Spec Kit took
3.5 hours against 23 minutes, and nothing enforces the process. One author's audit of
claude-flow claims most of its 300+ tools do nothing. *Summary only, unverified.*
<https://dev.to/willtorber/spec-kit-vs-bmad-vs-openspec-choosing-an-sdd-framework-in-2026-d3j>
· <https://gist.github.com/roman-rr/ed603b676af019b8740423d2bb8e4bf6>

**Anthropic's own guidance.** *An unattended build loop for whole apps, with no queue and no landing step.*
- "Harness design for long-running application development", 2026-03-24. A separate
  evaluator is easier to tune sceptical than a self-critical generator; untuned, Claude was
  "a poor QA agent". A solo run took 20 minutes and $9 with the core feature broken; the
  full harness took 6 hours and $200. With a newer model the sprint structure was removed
  and the planner and evaluator kept. *Fetched through a summarising fetch; quotes may be
  paraphrased.* <https://www.anthropic.com/engineering/harness-design-long-running-apps>
- "Multi-agent coordination patterns", 2026-04-10. "The verifier is only as good as its
  criteria." <https://claude.com/blog/multi-agent-coordination-patterns>

### Factories missed on the first pass

All found and fetched 2026-10-11 unless marked. Throughput numbers are each company's own
claim.

**Stripe Minions** (2026-02-09). Triggered by a Slack tag, a ticket, or a flaky-test
button. Each run gets a pre-warmed devbox in about 10 seconds, "isolated from production
resources and the internet". Runs "interleave agent loops and deterministic code": git,
lint and tests are fixed steps, not prompts. Local lint in under 5 seconds, then CI, with
"at most two rounds of CI." A human reviews the finished PR only. Claimed: "over a
thousand pull requests merged each week". *Fetched.*
<https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents>

**Spotify Honk, part 3** (2025-12-09). Verifiers run in a Claude Code stop hook; if one
fails, "the PR isn't opened". An LLM judge compares the diff to the original prompt to
catch scope creep. Measured: it vetoes "about a quarter" of sessions, and the agent
recovers "half the time". A later InfoQ piece says the judge was removed as too rigid
(*summary only, unverified*). *Fetched.*
<https://engineering.atspotify.com/2025/12/feedback-loops-background-coding-agents-part-3>

**Ramp Inspect** (undated). One sandbox VM per session. The agent checks its own work
with screenshots, tests and telemetry. The PR opens under the user's token, so the author
cannot approve it. Claimed: "~30% of all pull requests merged". *Fetched.*
<https://builders.ramp.com/post/why-we-built-our-background-agent>

**addyosmani/factory** (pushed 2026-08-21, 227 stars). Unattended up to a draft PR. A
human-owned `CHARTER.md` says what agents may pick up. A fresh verifier must "prove that
the new test fails without the" change. It will "stop producing when that queue reaches
your limit". A human does "every merge". *Fetched.* <https://github.com/addyosmani/factory>

**greynewell/claude-software-factory** (pushed 2026-09-26, 6 stars). Issue in, a second
Claude reviews, and "When CI is green and reviews pass, the PR gets merged". No loop cap
seen. *Fetched.* <https://github.com/greynewell/claude-software-factory>

**falkobuttler/software-factory** (pushed 2026-08-22, 1 star). Label an issue; an "AI
reviewer checks the PR (up to 3 rounds)", then it is ready for a person. It has an
`ai:stuck` label and asks questions as issue comments. *Fetched.*
<https://github.com/falkobuttler/software-factory>

**GitHub Copilot cloud agent** (live docs). A background agent to a PR: an ephemeral cloud
environment, one branch and one PR per task, Copilot code review, then a human. *Fetched.*
<https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent>

**OpenAI, "Harness engineering"** (2026-02-11). The primary page returned 403. Secondary
sources claim about 1 million lines with no hand-written code. *Unverified.*

Not checked: Factory.ai droids, Cursor cloud agents, Devin, `kingpinXD/factory`.

## 3. Ideas worth borrowing, in order

1. **Bring back an adversarial pass, on a different model.** The audit found 92 Breaker
   findings with a high in 7 of 8 runs; the plan dropped it by the owner's decision.
   Community evidence agrees with the audit. Cheapest form: the Codex bot already reviews
   the PR through `pr-shepherd`, so run a Codex review before the approver instead of
   after it. Alternative: a competing-pair lens per Vincent's prompt.
2. **Holdout acceptance checks.** The spec-writer writes a few checks the builder never
   sees; the approver runs them. This is the one borrowable idea with no counterpart in
   our loop.
3. **Pick lenses from the diff.** Skip `ux` and `ui` when the diff has no pages. Saves two
   agents a round on back-end jobs.
4. **Severity on findings.** Already in place. Each of the four lens files says to use
   `CHANGES` only for blocking problems and to put the rest under Notes. This is the
   community's stated cure for loops that never converge.
5. **Scoped re-review.** In rounds 2 and 3, a lens that said `PASS` reads only the fix
   diff, or is not re-run.
6. **Stronger model on the last resume.** Not applicable. Our builder is already on
   Opus, so there is no stronger step.
7. **Retro writes one file per learning** to `docs/solutions/`, with a pointer in
   `AGENTS.md`, so `AGENTS.md` does not grow with every job.
8. **Scope the reviewers' reading.** Already in place. Each lens is told to read
   `git diff <base>...<branch>` and open whole files only where the diff is not enough.

Warned against, and already avoided by us: the builder declaring its own work done;
auto-merge without checking test status; persona org charts and heavy spec artifacts for
small changes; large swarms, reported near 10 times a normal session's cost with output
nobody can review.

## 4. Setup details

### Claude Code mechanics

From <https://code.claude.com/docs/en/sub-agents> and
<https://code.claude.com/docs/en/agent-teams>, live docs fetched 2026-10-11.

- **Resuming the builder.** `SendMessage` resumes a subagent by ID or name with its full
  history, and "doesn't require agent teams to be enabled". The docs name no setting that
  gates it. The session that did this research has no `SendMessage` tool, cause unverified.
  The docs give no other way for Claude to resume a named subagent, so in such a session
  `/factory` always takes the fresh-builder branch. The skill already handles that.
- **A name can be refused.** If a newer agent has reused a name, the send is refused; the
  check resets on `/clear`. `builder-<job-id>` is unique per job, so this bites only on
  `/factory rework`, which already spawns fresh.
- **Agent teams change what a named spawn means.** With
  `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, a named subagent spawned from the main
  conversation "launches as a teammate instead" and runs in the main session's working
  directory. That would put `builder-<job-id>` in the main checkout, not the job's
  worktree. Our builder takes its worktree as an absolute path in the prompt, which should
  hold, but it is untested with teams on. The variable is unset on this machine today.
- **Limits.** 20 subagents at once by default (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`,
  v2.1.217+). Three layers of nesting (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1` turns it
  off). One job uses at most 4 at once, so the cap matters only past 5 jobs in one
  session, which we do not do.
- **Model order.** The call's `model`, then the agent file's, then
  `CLAUDE_CODE_SUBAGENT_MODEL`, then the parent's. This is why the skill passes no `model`.
  `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` overrides the first two (v2.1.257+).
- **Agent file fields.** `effort`, `maxTurns`, `background`, `memory`,
  `isolation: worktree`. `permissionMode` is "ignored for plugin subagents". An
  `isolation: worktree` worktree is removed if its agent changes nothing, and has no fixed
  branch name or path. Our job needs `factory/<job-id>` at a path in `job.json` that the
  reviewers and the retro reopen, so it cannot replace our own `git worktree add`.
- **Background subagents** get a smaller tool set, and their permission prompts surface in
  the main session.
- **Agent teams** are experimental, off by default, interactive only. Guidance: 3 to 5
  teammates with 5 to 6 tasks each; token use scales linearly with team size; one team per
  session, no nesting. Quality-gate hooks: `TeammateIdle`, `TaskCreated`, `TaskCompleted`.
  Nothing in our loop needs them.
- **Cross-session messaging** is on by default from v2.1.224 on macOS and Linux
  (<https://code.claude.com/docs/en/cross-session-messaging>). A possible way for parallel
  `/factory` sessions to tell each other a job has landed. Unexplored.

### Several jobs on one repo

- **Worktrees isolate files only.** Ports, databases, caches and secrets stay shared. Enough
  for 3 to 5 agents. *Fetched*, updated 2026-06-18.
  <https://www.augmentcode.com/guides/git-worktrees-parallel-ai-agent-execution>
- **Merge conflicts are the real cost of parallel jobs.** 27.67% of 107,026 agent PRs
  conflict, and the rate climbs with size: about 9.9% at 2 lines of churn, about 30% at 25
  lines. *Fetched.* <https://arxiv.org/html/2604.03551v1> (2026-04-04). A secondary summary
  adds that cross-agent pairs conflict 41.7% of the time against 19.8% within one agent,
  and lockfiles are only 3.9% of conflicts.
  <https://codex.danielvaughan.com/2026/07/28/agent-pr-merge-conflicts-concurrent-coding-agents-codex-cli-worktree-isolation-coordination-defence/>
- **Defences people use.** Land one at a time; rebase the next job onto the new base and
  rerun checks; keep file scopes from overlapping; run `git merge-tree` early for warning;
  CI on every merge.
- **The merge queue becomes the bottleneck.** A serial queue with 30-minute CI lands at
  most 48 PRs a day. <https://tianpan.co/blog/2026-07-02-the-merge-queue-is-the-new-bottleneck>
  (2026-07-02)
- **Install cost.** Every job pays a full install. pnpm: `virtualStoreType: global` in
  `pnpm-workspace.yaml` makes later worktree installs mostly symlinks
  (<https://pnpm.io/git-worktrees>). Others: `npm ci --prefer-offline`, copy-on-write
  copies, a pool of pre-warmed worktrees. A Bun equivalent was not checked.
- **Sandboxing.** Mike McQuaid runs worktrees inside a macOS sandbox user and agents never
  push; he pushes after review (2026-04-14).
  <https://mikemcquaid.com/sandboxed-agent-worktrees-my-coding-and-ai-setup-in-2026/>
- **Watching many agents.** Claude Squad (tmux, works on Linux), Herdr (agent status per
  pane, socket API), Conductor (Mac only). Vibe Kanban's maker shut down in April 2026 and
  Crystal was deprecated in February 2026. *Summary only.*
- **Cost.** An Opus lead with four Sonnet workers is about 40% cheaper than five Opus, by
  list-price maths only. One postmortem blames 1 to 2 million Opus tokens per task on
  subagents inheriting the lead's model. *Both unverified.* No wall-clock data was found
  anywhere.
- **How many one person can watch.** 2 to 4 sessions is typical; attention is the limit,
  not compute (<https://aq.dev/guides/how-many-coding-agents-can-one-developer-run/>,
  2026-08-17). Superset reports 5 to 7.

### Three setup changes this points to for `/factory`

1. **Rebase before landing.** Rebase `factory/<job-id>` onto the current base, rerun the
   project's checks, then land. With parallel jobs a stale base is the main risk, and our
   Land step does not check for it today.
2. **Early clash warning.** The approver already runs
   `git merge-tree --write-tree <base> <branch>`. That is the last step before landing, so
   a clash found there has no builder round left to fix it. Running the same check at
   Build check would catch it while rounds remain.
3. **A shared-install line** in the project's `## Factory` section, for projects where the
   package manager supports it.

## 5. Not covered

Reddit threads. The source author's video. The Claude Code hooks, headless and worktrees
doc pages. Real cost or timing numbers for any pipeline. Browser-session isolation
techniques beyond our per-job ports.

## 6. Evaluation

Added 2026-10-11, after reading the four lens files and the approver. That reading
corrected three points above (3.4, 3.6, 3.8) and one in section 4.

**Labels.** *Measured* is a number its source measured. *Claim* is a vendor or single-author
number. *Estimate* is mine, from the structure of the loop. No `/factory` job has run yet
(`lif-workbench-factory/jobs/` is empty), so every number about our own factory is an
estimate.

### 6.1 Our factory's speed and cost, as built

Agent runs per job, from `SKILL.md` and the agent files' `model` lines (*estimate*):

| Review rounds | Opus runs | Sonnet runs | Total | Serial stages before Land |
|---|---|---|---|---|
| 1 | 4 (spec, builder, security, approver) | 4 (ux, ui, code, retro) | 8 | 5 |
| 2 | 6 | 7 | 13 | 7 |
| 3, the cap | 8 | 10 | 18 | 9 |

- Each extra round adds 2 Opus runs and 3 Sonnet runs.
- The four lenses run at once, so a round takes as long as its slowest lens. The likely
  slowest are `ux` and `ui`, which start a server and drive a browser, and `security`,
  which is on Opus.
- Everything else is serial: spec, build, review, retro, approve, then Land. Land by PR
  adds the Codex bot's review and CI on top.
- The orchestrator holds only first lines and `job.json`, so its own context stays small.
- One in-house anchor: the `/shipit` run `draft-upscale` has a logged span of 2026-10-08 21:30 to
  23:59, about 2 h 29 min, for a multi-slice run with Breaker and Tester. *Measured*, but
  a different pipeline, and the run may have gone on past its last timestamp.

### 6.2 Each approach against ours

| Approach | Shape against ours | Speed | Cost | Pros | Cons | Take from it |
|---|---|---|---|---|---|---|
| **zazencodes factory** (our source) | Ours minus retro, landing by local merge | Same spine as ours | Same as ours, minus one Sonnet run | Small enough to read whole. File contracts | Merges to `main` with no PR. No cross-model review. General checklists | Already taken. Tailor checklists per project through `## Factory` |
| **freeCodeCamp factory** | Longer serial chain, 7 roles, 3 human gates, one validator | Slower. Each gate waits on a person | Lower per run: one reviewer, a small-model researcher | Humans catch a wrong direction early. Hooks enforce rules | Three stops per feature. No loop cap stated. No adversarial pass | Nothing. Our audit found Gate 1 approved every time |
| **superpowers** | Fresh implementer per task, one reviewer giving two verdicts, branch review at the end | Reported slow: reviewers took 20 to 33 min each (*measured*, issue #1538) | Up to 5 fix rounds per task, across many tasks | Scoped re-review. Rulings ledger. Model step-up | Per-task review multiplies runs. Cap of 5 is loose | Scoped re-review in later rounds |
| **Adversarial pair** (Vincent) | Two reviewers compete on one diff | One extra parallel step | 2 extra runs per pass | Finds more serious issues than a neutral reviewer, by his account | Reward framing invites invented findings. No numbers given | The cross-model idea, not the pair |
| **compound-engineering** (Every) | Brainstorm, plan, work, simplify, review, compound. Reviewers chosen from the diff | Faster on small diffs: fewer reviewers spawn | Scales with the diff, not fixed at four | No wasted lenses. Learnings stay out of `AGENTS.md` | Roster choice is a judgement call that can skip a needed lens | Skip lenses a job cannot need |
| **StrongDM factory** | No human review at all. Hidden end-to-end scenarios as the judge | Fast: no human in the loop | $1,000 per engineer per day (*claim*) | Builder cannot game checks it cannot see | Needs a scenario harness and stand-in services. Cost | Holdout checks, later |
| **HN red and green teams** | Spec, red team writes tests, green team sees only failures | One extra serial stage | One extra agent per feature | Tests are written blind to the code | Poster reported near-endless loops from hard gates | Nothing new. Our lenses already park taste under Notes |
| **Ralph loop** | One prompt in a shell loop, fresh context each pass | Fast per pass, unbounded passes | Cheap per pass. A fresh review cost $0.11 (*measured*) | Almost no machinery. Tests as backpressure | Passed 28 tests and still broke the spec. No roles, no gate | Confirms our rule: the writer never approves itself |
| **Gas Town and beads** | Many workers around an issue tracker and a merge queue | High throughput when it works | About $100 in one hour (*measured*, one day) | Scales past one feature at a time | A PR merged with failing tests. All four PRs closed | Nothing. Too much machinery for one person |
| **Anthropic harness** | Planner, generator, sceptical evaluator, file handoffs | 6 h against 20 min solo (*measured*) | $200 against $9 solo (*measured*) | The harness run worked; the solo run's core feature was broken | 22 times the cost, 18 times the time | Keep the evaluator separate. Drop structure as models improve |
| **Agent teams** (Claude Code) | Peers that message each other, not a hub | Parallel, but task status can lag | Tokens scale with team size (docs) | Agents can debate | Experimental. One team per session. A named spawn lands in the main checkout | Nothing. Our loop needs no agent-to-agent talk |
| **spec-kit, BMAD, claude-flow** | Persona chains with phase gates | 3.5 h against 23 min (*claim, unverified*) | Heavy up-front tokens (*claim, unverified*) | Thorough paperwork | Nothing enforces the process | Nothing |

Where ours sits: mid-weight. Heavier than Ralph or the source on review, far lighter than
Gas Town, StrongDM or the Anthropic harness. Its distinct strengths are the strict
first-line contracts, the hard round cap, and an approver that can refuse. Its distinct
cost is four lenses on every round whatever the change.

### 6.3 What to take in, ranked

**Applied 2026-10-11** in `lif-workflow` 1.10.0: the three items below and the
second-model review, which runs GPT 6.1 Sol through the `pi` CLI. Item 2 merges the base
in, not a rebase, so a pushed branch never needs a force push.

Smallest change with the strongest evidence first. All three are mostly edits
to `plugins/lif-workflow/skills/factory/SKILL.md`. Item 2 may add a line to
`factory-builder.md`, and item 3 also touches `assets/dashboard.html`.

1. **Skip the `ux` and `ui` lenses for projects with no pages.** When the project's
   `## Factory` section says `Pages: none`, spawn only `security` and `code`. Today both
   page lenses still spawn and review by reading code. Saves 2 of 4 lens runs each round,
   up to 6 of 18 runs a job, and removes the two lenses that drive a browser (*estimate*).
   Evidence: Every picks reviewers from the diff. Risk: low, since the signal is a line
   the owner wrote, not a guess from the diff.
2. **Check for a moved base before Land.** If the base branch has moved since the job was
   cut, send the builder to rebase and rerun the project's checks, then land. Adds one
   builder run only when the base moved. Evidence: 27.67% of 107,026 agent PRs conflict
   (*measured*, arXiv 2604.03551), and the approver's `git merge-tree` check sees only
   text conflicts, not a change that merges cleanly and breaks the tests. Also run that
   `merge-tree` check at Build check, where builder rounds remain.
3. **In rounds 2 and 3, re-run only the lenses that said `CHANGES`, plus `code`.** `code`
   always runs because it runs the project's checks. A lens that passed keeps its `PASS`.
   Saves 1 to 2 runs per later round (*estimate*). Evidence: superpowers scopes its
   re-reviews. Risk: a fix can break something a passed lens covered; the `code` lens and
   the approver are the backstop. Cost: the "all four files exist" rule and the dashboard
   both assume four files per round, so this is the largest of the three edits.

**One question that is the owner's, not an intake.** The plan dropped the Breaker by
decision. The audit (92 findings, a high in 7 of 8 runs) and every community source with a
view point the other way. The cheapest way back is not the Breaker: run the existing
`lif-workflow:codex` review once, after all lenses pass and before the retro. That is one
extra run per job, on a different model, and it also covers `Land: merge` projects, which
today get no cross-model review at all. `Land: pr` projects already get the Codex bot on
the PR, after the approver has ruled.

**Deferred, each a new mechanism.**
- Holdout acceptance checks. Evidence is one company's account and one small experiment.
  Revisit if jobs pass review and then fail in use.
- Retro to `docs/solutions/`. Revisit when a project's `AGENTS.md` has grown enough to
  hurt. Past retros landed 3 to 5 edits a run.

**Rejected.** Human gates before the build (audit: approved every time). Agent teams.
An issue tracker for claims. A model step-up (the builder is already on Opus). Severity
rules and scoped reading (already in the lens files).

## 7. After the factory check

Added 2026-10-11. Section 0 sorts the examples; this section says what that changes.

### 7.1 True factories against ours

Only examples that pass the definition in section 0.

| Factory | Trigger | Isolation | What verifies | Loop cap | Human | Lands by | Numbers |
|---|---|---|---|---|---|---|---|
| **Ours, 1.10.0** | `/factory <feature>` or `next` | Worktree per job | Up to 4 lenses, then a second model, then an approver | 3 review rounds | Merge question, or escalation | PR or local merge | None yet: no job has run |
| **zazencodes** | `/factory <feature>` | Worktree per job | 4 lenses, approver | 3 review rounds | Escalation | Local merge to `main` | None given |
| **StrongDM** | Specs and scenarios | Stand-in services | Hidden scenarios, scored by likely user satisfaction | Not stated | None on code | Not stated | $1,000 per engineer per day (*claim*) |
| **compound `/lfg`** | One command | The session's checkout | Multi-agent review, fixes applied | Not stated | Before and after | Commit, push when a remote exists | None given |
| **Stripe Minions** | Slack tag, ticket, button | Devbox, no internet | Fixed lint and test steps, then CI | 2 rounds of CI | Reviews the PR | PR | "over a thousand" PRs merged a week (*claim*) |
| **Spotify Honk** | Background task | Not stated | Verifiers in a stop hook, plus a scope judge | Not stated | Reviews the PR | PR, opened only if verifiers pass | Judge vetoes about a quarter (*measured*) |
| **Ramp Inspect** | A session per request | Sandbox VM | Its own screenshots, tests, telemetry | Not stated | Someone other than the author | PR | "~30%" of merged PRs (*claim*) |
| **addyosmani/factory** | Issues the charter allows | Not read | A fresh verifier proves the test can fail | Stops when the review queue is full | Every merge | Draft PR | None given |
| **greynewell** | An issue | Not read | A second Claude, CI | None seen | None | Auto-merge on green | None given |
| **falkobuttler** | A labelled issue | Not read | An AI reviewer | 3 review rounds | Merges | Ready PR | None given |
| **Copilot cloud agent** | An assigned task | Cloud environment | Copilot code review | Not stated | Reviews the PR | PR | None given |

Against these, ours is the most heavily reviewed: no other factory here runs parallel
lenses, a second vendor's model and a separate approver. It is also the only one with no
checks that run as fixed code. The industrial ones (Stripe, Spotify) lean the other way:
few model reviewers, hard deterministic gates, and a human on every PR.

### 7.2 How much weight the applied changes still carry

The four changes in `lif-workflow` 1.10.0 were justified partly by steered workflows.

| Change | First evidence | Its class | Factory evidence | Standing |
|---|---|---|---|---|
| Skip `ux` and `ui` when `Pages: none` | Every picks reviewers from the diff | Steered by default | Stripe and Spotify run only checks that apply | Holds. Ours keys on a line the owner wrote, which is safer than a guess from the diff |
| Rerun only lenses that said `CHANGES`, plus `code` | superpowers scopes re-reviews | Unattended stage, with a human landing it | None found | Weakest. In superpowers a person still lands the work. Watch for a fix that breaks a passed lens |
| Merge a moved base before Land | arXiv 2604.03551, 107,026 agent PRs | Measured, class-free | Stripe caps CI rounds; all PR factories lean on CI | Holds |
| Second-model review | Our own audit; Vincent; an HN poster | Technique and anecdote | greynewell uses a second Claude, not a second vendor | Holds on our audit's 92 findings, not on the community |

The count in the first report, "every community source with a view wants an adversarial
pass", overstated it: those sources were a technique, an anecdote and a steered workflow.

Two rejections also lose their footing but stand on our own audit: "human gates before
the build" (freeCodeCamp is steered, so it was never evidence for or against) and "an
issue tracker for claims" (Gas Town).

### 7.3 Ideas from true factories, not yet in ours

**Applied 2026-10-11** in `lif-workflow` 1.11.0: items 1 to 3. Item 1 is the `Checks`
line of a project's `## Factory` section, run by the orchestrator at Build check. Items 4
and 5 stay out.

1. **Checks as fixed steps, not prompts.** Stripe and Spotify run lint and tests as code
   the agent cannot argue with. Ours trusts the evidence the builder writes in
   `build.md`, though the `code` lens reruns the checks. The orchestrator could run the
   project's check commands itself at Build check.
2. **A scope judge.** Spotify compares the diff with the original request to catch
   unasked changes; it vetoed about a quarter of sessions. None of our lenses owns that.
   It fits the approver, which already reads the spec and the diff.
3. **Prove the test can fail.** Osmani's verifier shows each new test fails without the
   change. Our `code` lens only flags tests that restate the code.
4. **Stop when the human's queue is full.** Osmani caps the review queue.
   `/factory next` has no limit on jobs waiting in `needs-human` or `pr-open`.
5. **Holdout scenarios.** StrongDM is still the only source. It stays deferred.

