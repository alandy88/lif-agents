# Handoff

## Goal

Make the `/lif-workflow:shipit` flow (idea → one merged PR through Claude subagents) fit with the `lif-effort` mod's automatic model and effort choice, and simplify shipit where it is over-engineered.

The user (Peter) asked three things in turn:

1. Brainstorm how shipit fits lif-effort's auto classifier, and how lif-effort handles subagents.
2. Whether lif-effort could own subagent orchestration instead, since shipit may be over-complex.
3. "plan 1 and check 3": plan moving shipit's roles into agent files (option 1), and audit the 8 past shipit runs to see which stages earned their place (option 3).

All three were answered in chat. **No file in the repo has been changed by this work.** The plan for option 1 was presented and is waiting for Peter's yes.

Repo: `/home/peteryu/github/personal/lif-agents` (branch `main`). Toolchain is Bun. Read `AGENTS.md` and `plugins/AGENTS.md` first.

## Done

### How lif-effort handles subagents (read from code)

- `plugins/lif-effort/hooks/register.tsx`: in `turn.step`, when `e.agentId !== undefined` the hook only calls `noteAgent(...)` to record model and effort, then `return yield* next(e)` unchanged. In `tool.call` it records `activityOf(...)` for the subagent. In `session.compact` a subagent's compaction goes straight to `next(e)` (native).
- `refreshAgents` polls `$.agent.list()` every `AGENT_POLL_MS = 2000` and feeds the `Agents (n)` bar button and the Agents pane (`hooks/agents.ts`, `hooks/ui.tsx`).
- There is no `agent.spawn` hook. `plugins/lif-effort/tests/lifecycle.test.ts` has `test('subagent requests are never rewritten', ...)`. `README.md` says "Subagent requests are never changed."
- So lif-effort watches subagents and never steers them. It steers only the main chat (shipit's Orchestrator).

### How the classifier meets shipit (read from code)

- `hooks/classify.ts`: session model is picked once, on the first prompt where `isSubstantive(text)` holds (not a continuation, at least 4 whitespace-separated words). `/lif-workflow:shipit 42` is 2 words.
- `isContinuation` matches `yes`, `ok`, `do it`, `proceed` etc. and short-circuits before the classifier, so a Gate answer keeps the previous effort. `bindTurn` pins effort at turn start, and a shipit run after Gate 1 is one long turn.
- `plugins/lif-workflow/skills/shipit/SKILL.md` sets a model for one role only (Breaker, `model: opus`). Builder, Reviewer, Tester, Findings Tester, Retro, fix Builder and the merge-conflict subagent name none.

### Facts from the engine type file

`plugins/lif-effort/.claude-plugin/types/claude-code/index.d.ts` (gitignored, built against 2.1.295):

- `AgentSpawnInput.model`: "undefined lets the agent's own model, then the parent's, decide." So precedence is Agent-call `model` > agent definition > parent.
- `AgentSpawnInput.parentModel`: "The parent's effective model, what `inherit` resolves to." `AgentSpawnInput` has `model` but no `effort` field.
- `TurnStepInput`: a hook may rewrite `model` or `effort`, including on a subagent's step (`agentId` set).
- `$.agent.spawn`: "It runs every hook but the calling one"; a subagent a hook spawned "steps past that hook". So a mod that spawns its own subagents cannot see or steer them through its own hooks.
- `AgentSpec` (same fields as a plugin agent file `agents/<name>.md`, type name `<plugin>:<name>`): `name`, `description`, `prompt`, `tools`, `disallowedTools`, `model`, `effort`, `permissionMode`, `mcpServers`, `hooks`, `maxTurns`, `autoCompactWindow`, `skills`, `initialPrompt` (with `{{intent}}`), `memory`, `background`, `omitClaudeMd`, `isolation`.
- A `skill.prompt` event exists (fires when the engine expands a skill's prompt, carries `skill` and `text`).

### Audit of the 8 past shipit runs (check 3)

Run state lives at `<repo>/.git/shipit/<slug>/` in `/home/peteryu/github/personal/`:
`comfyui-lif-nodes`: `pixai-tagger`, `pl2-pin-search`, `wb-publish`; `lif-workbench`: `creator-looks`, `douyin-insights`, `draft-upscale`, `linked-workflows`, `studio-prompt-build`. Evidence came from each `plan.md` (Log section, slice fields), `reports/breaker.json` (or `reports/breaker-notes.md` for `draft-upscale`), `retro.md`, `learnings.jsonl`, and the `briefs/` listing. `wb-publish/plan.md` has an empty log.

| Stage | Evidence | Verdict |
| --- | --- | --- |
| Breaker | 92 findings over 8 runs: 9 high, 32 medium, 51 low. 7 runs had at least one high; the 8th (`creator-looks`) had 3 medium. Logs show nearly every high/medium fixed. | Keep |
| Tester | Fixed the Breaker's findings in the 6 older, sequential runs. In the 2 newest (Break ∥ Test) runs it found its own problems: `draft-upscale` "options carried no stages: page never showed the switch", `studio-prompt-build` picker reopen drops earlier picks (upstream). | Keep |
| Reviewer | 39 dispatches. Mostly tidy/cleanup/docs commits. 6 medium fixes, all in the 2 newest runs (`draft-upscale` 2, `studio-prompt-build` 4). Older runs noted mediums and passed them on. 3 "large" findings, all low severity, all handed to the Tester; none led to a fix Builder. | Weakest, but paired with Builders skipping standards: cut both or neither |
| Retro | 5 `retro.md` files. Each landed 3 to 5 repo `AGENTS.md` edits in one commit; over half the notes dropped. 13 issues proposed across 3 runs (1, 1, 11); logs show none approved. Vault edits proposed in 2 runs, 1 approved. | Keep the repo edits |
| Findings Tester | Exists only in the 2 wave-era runs. Its "skip when no high/medium" branch never applied: all 8 runs had a high or medium. | Candidate to fold into Tester (Breaker then Tester in sequence, as the first 6 runs did; drops the frozen worktree). Trade: loses the wall-clock overlap |
| Retries | `Retries used: 0 of 2` in all 19 slices that record it. | Shrink to one line |
| Conflict subagent | No merge conflict logged in any run. | One line is fine |
| Waves | Used in 2 runs; at most 3 slices at once; "up to 6" never reached. | Keep |
| Gates | Approved every time; Gate 2 carried real decisions (e.g. `douyin-insights` "fix Windows tzdata first"). | Keep |

Other findings:

- **Brief templating was reinvented in 3 of 8 runs**: `douyin-insights` (`footer.md`, `mkreview.sh`, `reviewer.tmpl`, `builder-N.body`), `draft-upscale` (`common.txt`, `footer.txt`, `ladder.txt`, `mk_review.sh`), `studio-prompt-build` (`rev.sh`, `reviewer-common.md`). This is the main bloat, and the direct evidence for option 1.
- The Codex bot still found P1/P2 issues on all 6 merged PRs with logs, so the stages are not redundant with it.
- Learnings: 156 lines (81 gotcha, 63 learning, 12 friction); builders 68, reviewers 43, testers 20, breaker 7.
- Missing rather than excess (out of scope for plan 1): probes / "Wave 0" were invented in 3 runs; retros proposed "install dependencies when creating a worktree" and "long post-commit hooks and how to wait on them" as shipit issues.
- Past runs never recorded which model each role ran on.

### Plan 1 as presented (not approved yet)

New folder `plugins/lif-workflow/agents/`, one file per role, each carrying model, effort and the standing rules now in `references/briefs.md`:

| File | Model | Effort | Also |
| --- | --- | --- | --- |
| `builder.md` | `sonnet` | high | |
| `reviewer.md` | `opus` | high | holds the fix ladder |
| `breaker.md` | `opus` | xhigh | `disallowedTools: Edit, Write` |
| `tester.md` | `sonnet` | high | holds the fix ladder; also used for the Findings Tester |

Then:

1. `plugins/lif-workflow/skills/shipit/SKILL.md`: Roles table names each agent type (`lif-workflow:builder` etc.); drop "`model: opus`" from the Breaker row and "Dispatch with `model: "opus"`"; Retro and the conflict subagent get a model stated for the Agent call; drop the "paste the Fix ladder" instruction, keeping only what the Orchestrator does with a Large finding.
2. `plugins/lif-workflow/skills/shipit/references/briefs.md`: keep only per-slice parts (`<goal>`, `<scope>`, `<context>`, `<done_when>`); move `<instructions>`, `<fix_ladder>`, `<report>` and the shared footer (work only inside the worktree; append to `learnings.jsonl`) into the agent files. About 258 lines to about 110.
3. `plugins/lif-workflow/.claude-plugin/plugin.json`: `1.7.0` → `1.8.0` (`plugins/AGENTS.md` requires a bump or users do not receive the change).
4. `plugins/AGENTS.md`: the `lif-workflow/` line gains `agents/`.
5. Check: `claude plugin validate plugins/lif-workflow`, then one small live `/shipit` run, watching lif-effort's Agents pane for each role's type and model.

## Decisions

- **lif-effort should not own orchestration.** The flow (what to build, order, merges, gates) is judgment that needs a model reading a skill; a mod is plain code and already has many jobs. Also a mod's own `$.agent.spawn` subagents bypass its own hooks. lif-effort stays a watcher.
- **Option 1 chosen by Peter for planning** (roles as agent files in `lif-workflow`), together with option 3 (audit). Option 2 (lif-effort fills a missing subagent model via an `agent.spawn` hook with a Haiku call) was not chosen: a second place choosing models, and that hook cannot set effort.
- **Four agent files, not one per dispatch.** Retro and the conflict subagent keep a model on the Agent call instead, because Retro's standing rules already live in the `retro` skill and preloading it is unverified.
- **Do not use `isolation: 'worktree'`** in the agent files: shipit's merge flow depends on its own worktree paths and `shipit/<slug>-<n>` branches.
- **`omitClaudeMd: true` for Builder was left out** of the plan. It would encode "Builders skip standards" structurally, but it also drops repo commands and the user's global rules; treat as an optional follow-up, not part of the move.
- **`initialPrompt` with `{{intent}}` left out**: the agent body is enough.
- The models and efforts in the table are a first guess (Peter's `~/.claude/CLAUDE.md` sizing table: lookup `haiku`, defined work `sonnet`, judgment `opus`); no past run recorded models to check against.
- No planning or audit document was written to the repo; Peter did not ask for one.

## Files

Read, not changed:

- `plugins/lif-effort/hooks/register.tsx`, `classify.ts`, `lifecycle.ts`, `agents.ts`, `config.ts`; `plugins/lif-effort/README.md`; `plugins/lif-effort/tests/lifecycle.test.ts`
- `plugins/lif-effort/.claude-plugin/types/claude-code/index.d.ts` (engine declarations, gitignored)
- `plugins/lif-workflow/skills/shipit/SKILL.md` (232 lines), `references/briefs.md` (258 lines), `assets/plan-template.md`
- `plugins/lif-workflow/.claude-plugin/plugin.json` (version `1.7.0`), `.claude-plugin/marketplace.json`, `plugins/AGENTS.md`
- Past runs under `/home/peteryu/github/personal/{comfyui-lif-nodes,lif-workbench}/.git/shipit/*/`

To be created or edited once plan 1 is approved:

- `plugins/lif-workflow/agents/builder.md`, `reviewer.md`, `breaker.md`, `tester.md` (new)
- `plugins/lif-workflow/skills/shipit/SKILL.md`, `plugins/lif-workflow/skills/shipit/references/briefs.md`
- `plugins/lif-workflow/.claude-plugin/plugin.json`, `plugins/AGENTS.md`

Unrelated working-tree state, not from this work, leave alone: modified `local/pwsh/profile.ps1` and `local/zsh/profile.zsh`; untracked `HANDOFF.md` (already existed at session start) and `local/pi/research/`. There are no shipit evals in `plugins/evals/skills/`, so none to update. `plugins/docs/skill-naming-convention.md:87` lists `shipit`; it needs no change unless agents get documented there.

## Open issues

1. **Plan 1 is not approved.** Peter has seen it and has not said yes.
2. **Global rule conflict (Peter's decision).** `~/.claude/CLAUDE.md` ("Subagent model") says to set `model` explicitly on every Agent call, and a call's `model` beats the agent file. The rule needs an exception such as "unless the agent type sets its own model". That file is Peter's private file, not tracked in this repo.
3. **Agent listing cost.** Plugin agents appear in every session's agent list, so a non-shipit session could dispatch `lif-workflow:builder`. Proposed mitigation: a description that says "shipit only". Hiding them properly needs an `agent.offer` hook, and `lif-workflow` has no hooks module of that kind. Peter has not answered.
4. **Unverified from code, need one live run:**
   - Whether `prompt.submit` sees `/lif-workflow:shipit <args>` as typed or as the expanded skill text. As typed, a short invocation skips the model pick and the next ≥4-word reply sets the model for the whole run.
   - Whether a subagent with no `model` inherits the app's own setting or lif-effort's routed model (lif-effort rewrites per request and never changes the app setting, so the app's is likely).
   - Whether a plugin agent file's `effort` applies as expected, and whether `skills:` preload works for a skill with `disable-model-invocation: true` (e.g. `retro`).
5. **Not addressed by plan 1:** the Orchestrator's own model and effort (the late model pick, and one effort covering the whole post-Gate-1 turn). A `skill.prompt` hook in lif-effort was floated as a way to pin Opus/high for shipit, not chosen.
6. **Possible shipit trims from the audit, not yet decided:** fold the Findings Tester into the Tester (sequential Breaker → Tester, no frozen worktree); cut the retry rule to one line; stop Retro proposing issues or reduce Gate 2's four separate asks; Reviewer is weakest but tied to Builders skipping standards.
7. `claude plugin validate` and the lif-effort checks were not run this session (nothing was changed).

## Next step

Ask Peter to approve plan 1 and to answer the two open decisions (add the "unless the agent type sets its own model" exception to `~/.claude/CLAUDE.md`; label the four agents "shipit only" by description), and whether to fold the Findings Tester into the Tester in the same change. Do not create or edit any file until he says yes; once he does, start by creating `plugins/lif-workflow/agents/builder.md`, `reviewer.md`, `breaker.md` and `tester.md` by moving the standing text out of `plugins/lif-workflow/skills/shipit/references/briefs.md`.
