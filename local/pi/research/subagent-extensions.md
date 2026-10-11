# GitHub subagent extensions for Pi

Research snapshot: **2026-10-08**. Inspected first-party GitHub READMEs, manifests, selected implementation and GitHub/npm metadata. The local host reports **Pi 1.1.0**, using `@earendil-works/pi-coding-agent`. **Nothing was installed or runtime-tested**; compatibility below is declared/static compatibility, not a successful smoke test. Repository HEAD features can differ from the published npm version.

## Recommendation

- **General-purpose delegation:** start by evaluating **[nicobailon/pi-subagents](https://github.com/nicobailon/pi-subagents)**. Built-in specialists, parallel reviews, saved workflows, background execution and fleet inspection give it the broadest turnkey surface in this shortlist. [N-R]
- **Claude Code-style agent/workflow UX:** evaluate **[tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents)**. Its distinguishing features are the `Agent` interface, steering/resume, scripted `parallel()`/`pipeline()`, optional memory and worktrees. [T-R]
- **Small API with persistent specialists:** **[mjakl/pi-subagent](https://github.com/mjakl/pi-subagent)**. Prefer it when named continuing conversations matter more than detached jobs or a workflow framework. [M-R]
- **Explicit spawn/message/wait control:** **[pi-codex-subagents](https://github.com/ogulcancelik/pi-extensions/tree/main/packages/pi-codex-subagents)**. “Codex-shaped” describes its API, not a requirement to use Codex models. [C-R]
- **Visible terminal workers:** **[heyhuynhgiabuu/pi-task](https://github.com/heyhuynhgiabuu/pi-task)**. It supports tmux/Herdr backends with SDK fallback. [H-R]

These are fit judgments, not benchmark rankings. For this repo's managed personal Pi setup, a sensible first decision is **broad features (`nicobailon`) versus a smaller delegation surface (`mjakl`)**. Install only one primary delegation runtime initially to avoid overlapping tools, commands and agent definitions.

## Comparison

| Candidate | Execution boundary | Parallel / workflows | Background / continuation | Main tradeoff |
| --- | --- | --- | --- | --- |
| **nicobailon/pi-subagents** | Foreground SDK sessions in parent; background sessions in detached runner | Parallel, chains, scripted workflows | Background jobs, fleet steering, durable missions/schedules | Large configuration and orchestration surface. [N-R, N-S] |
| **tintinweb/pi-subagents** | In-process SDK sessions; workflow worker thread | Concurrent agents; scripted `parallel()` and `pipeline()` | Default-background jobs, saved-session resume, optional memory/schedules | Background does not mean detached from the parent process. [T-R, T-S] |
| **mjakl/pi-subagent** | Separate Pi RPC child processes | Up to 8 calls, 4 workers per dispatch; no dedicated chain field | Blocking dispatch; persistent named child conversations | No native detached-background job API found. [M-R, M-S] |
| **ogulcancelik/pi-codex-subagents** | Separate Pi RPC child processes | Explicit spawn/wait/message primitives; parent composes workflow | Automatic completion delivery, steering, resume from persisted session | No bundled specialist templates; child repo instructions are disabled. [C-R, C-S] |
| **heyhuynhgiabuu/pi-task** | Terminal workers or in-process SDK fallback; experimental durable backend | Foreground/background task dispatch | Completion delivery, live steering; session continuation depends on backend | SDK fallback cannot reopen a previous Pi session. [H-R, H-S] |
| **agrigoryan/pi-subagents** | Default subprocess; experimental in-process SDK | Up to 8 tasks; shared 4-run limiter | Opt-in jobs with status/wait/cancel; completed snapshots persist | Deliberately bounded; active jobs do not survive shutdown/crashes. [A-R, A-S] |
| **Official Pi example** | Separate Pi subprocess per child | Single, parallel (8 tasks/4 concurrent), sequential chain | Foreground streaming; no detached-job API documented | Small baseline to own/extend, not a turnkey orchestration package. [O-R] |
| **nicobailon/pi-messenger** | Peer messaging plus separate Crew orchestration | PRD → dependency-linked tasks → parallel waves → review | Agent messaging, file reservations and task state | Team coordination rather than just a child-delegation tool. [P-R] |

Bracketed labels refer to sources below; each is an ordinary Markdown source link there.

## Candidate details

### nicobailon/pi-subagents

- Ships `scout`, `researcher`, `evidence-auditor`, `worker`, `reviewer`, `oracle`, and `delegate`. Web-research specialists require `pi-web-access` in the child; they do not gain browsing just by installing this extension. [N-R]
- FleetView/inspector provides live transcripts, steer/stop operations, artifacts and diagnostics through `/subagents-doctor`. Delegation is request/instruction-driven, not an automatic reviewer merely because the package is installed. [N-R]
- Current source uses host SDK `createAgentSession` for native children. Older descriptions saying every child is a separate Pi CLI process are incomplete for this snapshot. Optional `worktree: true` separates editing checkouts. A cumulative per-run spawn budget defaults to 64 and is separate from concurrency. [N-S, N-C]
- The documented fully validated standalone background target is **official Pi 0.86.1 Linux x64**; Windows standalone coverage is experimental. That narrow validation statement does not certify this machine's Pi 1.1.0. npm-hosted and standalone-hosted execution have different runner paths. [N-B]
- Published npm metadata: **0.76.1**, current `@earendil-works` peers; `pi-ai >=0.86.1`, coding-agent wildcard. [N-N]

### tintinweb/pi-subagents

- Claude Code-like tools include `Agent`, `get_subagent_result`, `steer_subagent`, plus `/agents`, FleetView, mentions, resume and scripted orchestration. Native children are **in-process sessions**, not per-agent processes. [T-R, T-S]
- Unknown-agent fallback can become a general-purpose agent; configure `fallbackSubagent: none` for fail-closed dispatch. Nested delegation is off by default; when enabled, children have their own privileges rather than automatically inheriting the parent's restrictions. [T-R]
- `isolated: true` scopes resources/tools; it is not an OS sandbox. Worktrees separate tracked edits, not shell privileges, and do not contain the parent's uncommitted changes. [T-Q, T-R]
- Published npm metadata: **0.19.0**, current namespace, Pi peers **>=0.84.0**. Source development baseline is older than the local host, so exercise workflows and child resource loading before adopting it. [T-N, T-P]

### mjakl/pi-subagent

- A compact `subagent({ calls: [...] })` surface; fresh or parent-cloned context, streaming, named continuation, inactivity/depth/cycle guards. Named sessions require a persisted parent; disk locks prevent simultaneous use. [M-R, M-S]
- Project agent definitions require explicit saved trust or approval. Unlike packages disabling all ambient extensions, its children can inherit extensions/safety hooks; interactive child UI requests are cancelled. Confirm the exact hook behavior needed for unattended runs. [M-R]
- Published npm metadata: **3.1.0**, current namespace, Pi peers **>=0.87.1**. [M-N]

### ogulcancelik/pi-codex-subagents

- Tools: `spawn_agent`, `wait_agent`, `wait_all_agents`, `list_agents`, `read_agent_response`, `send_message`, `interrupt_agent`. Agents/control are parent-session scoped; all-session listing is read-only. Completions automatically return to the correct parent; messaging can reopen a settled child's persisted session. [C-R]
- Children disable automatic extension, skill, prompt-template and context discovery, including **`AGENTS.md`/`CLAUDE.md`**. Pass task/repo policy explicitly and load required provider/safety extensions through templates. A custom provider registered only in the parent otherwise may be unavailable in the child. [C-R, C-S]
- No templates ship automatically. Model/provider/thinking can inherit the parent; per-spawn routing uses an explicit configuration allowlist. Published npm metadata: **0.3.5**, Pi **>=0.80.4**; README also requires Node **>=22.19**. [C-R, C-N]

### heyhuynhgiabuu/pi-task

- `task` supports foreground/background delegation, task progress/transcripts, steering and guards against delivering results to a different conversation/tree branch. Starter agents: `scout`, `explore`, `general`, `reviewer`. [H-R]
- tmux/Herdr give visible terminal workers; headless use falls back to SDK. A `conversation_id` or returned task ID supports continuing terminal Pi sessions, **not** reopening them through SDK fallback. SQLite-backed restart-resumable execution is marked experimental. [H-R]
- SDK children disable normal extension discovery. Verify custom provider and safety-hook requirements instead of assuming they match the parent. Its `--fast` flag can conflict with another extension owning that flag. [H-S, H-R]
- Published npm metadata: **0.11.1**, current namespace with wildcard Pi peers; source development packages are Pi **1.0.4**, relatively close to this local 1.1.0 host but still not proof of compatibility. [H-N, H-P]

### agrigoryan/pi-subagents

- Smaller, budget-oriented option. Defaults documented/source-inspected: **60 turns, 900 seconds, 32,000 generated tokens**, with 16 KiB model-visible output. These are execution controls, not hard billing guarantees. [A-R, A-S]
- Background completion is delivered on the next parent turn without waking an idle parent. Active jobs stop on shutdown/session replacement; completed accounting/transcripts restore, not continuing specialists. [A-R, A-S]
- Process mode disables ambient extensions/skills and explicitly loads allowed resources. That can also remove safety hooks/custom providers. `--offline` is startup-refresh behavior, not network containment. [A-R]
- Manifest name **`pi-subagents-simple` 0.1.0**; npm `/latest` returned **404** during this research. Use its documented checkout/local-extension route, not an assumed npm command. Manifest uses current namespace wildcard peers; README targets Pi **0.84.1+**. [A-R, A-P]

## Installation references — not executed

The following reproduce documented package sources; pin a reviewed version for adoption. [N-R, T-R, M-R, C-R, H-R, P-R]

```bash
pi install npm:pi-subagents
pi install npm:@tintinweb/pi-subagents
pi install npm:@mjakl/pi-subagent
pi install npm:@ogulcancelik/pi-codex-subagents
pi install npm:@heyhuynhgiabuu/pi-task
# Separate team-coordination option:
pi install npm:pi-messenger
```

Pi supports pinned npm versions and pinned Git tags/commits, one-invocation `-e` loading, and project-local package declarations. Read source before loading: extensions execute with the host user's permissions and can access credentials/session history. [O-P, O-E]

## Safety and adoption checks

1. **Context isolation ≠ filesystem isolation.** Separate processes, SDK sessions and Git worktrees are different boundaries; none alone is an OS/network sandbox. Bash access can bypass a nominal read-only tool list. [O-E, T-Q]
2. Start with a read-only scout and two independent reviewers; inspect model selection, cost, returned artifacts and completion routing before parallel editing.
3. Test which repo instructions, skills, custom providers and safety hooks actually reach the child. Packages deliberately make different inheritance choices. [M-R, C-R, H-S, A-R]
4. For parallel writers, use separate worktrees or explicit non-overlapping ownership. Messenger reservations help cooperating agents but are not OS access control. [N-C, T-Q, P-R]
5. Test interruption, parent exit, reload/restart and continuation separately. Persisted transcripts are not evidence that a job continues after the parent exits. [N-B, T-R, M-R, C-R, H-R, A-R]
6. Check package collisions against this repo's managed extensions, especially shared slash commands, agent-definition names and flags. These checks remain future adoption work, not completed runtime validation.

## Activity snapshot

GitHub API `pushed_at`, date-only UTC; stars are repo-level popularity, **not** reliability scores. The `ogulcancelik` figures are for its whole extension monorepo. All listed repos were unarchived at inspection. [API]

| Repository | Last push | Stars |
| --- | --- | ---: |
| nicobailon/pi-subagents | 2026-10-08 | 3,873 |
| tintinweb/pi-subagents | 2026-09-03 | 1,260 |
| mjakl/pi-subagent | 2026-10-02 | 79 |
| ogulcancelik/pi-extensions | 2026-09-26 | 556 |
| heyhuynhgiabuu/pi-task | 2026-10-08 | 61 |
| agrigoryan/pi-subagents | 2026-09-05 | 0 |
| nicobailon/pi-messenger | 2026-08-27 | 720 |

## Primary sources

GitHub source links are pinned to the inspected commits. npm links refer to mutable `/latest` metadata observed on the research date. Discovery search results were not treated as feature evidence.

- **N-R:** [nicobailon README](https://github.com/nicobailon/pi-subagents/blob/0c33ec7cb26ed1db270d72e746c3c975be880aeb/README.md)
- **N-S:** [Native SDK child implementation](https://github.com/nicobailon/pi-subagents/blob/0c33ec7cb26ed1db270d72e746c3c975be880aeb/src/runs/shared/child-session.ts)
- **N-C:** [Configuration: budgets/worktrees](https://github.com/nicobailon/pi-subagents/blob/0c33ec7cb26ed1db270d72e746c3c975be880aeb/docs/configuration.md)
- **N-B:** [Standalone background support/validation](https://github.com/nicobailon/pi-subagents/blob/0c33ec7cb26ed1db270d72e746c3c975be880aeb/docs/standalone-background.md)
- **N-N:** [Published pi-subagents metadata](https://registry.npmjs.org/pi-subagents/latest)
- **T-R:** [tintinweb README](https://github.com/tintinweb/pi-subagents/blob/e955e29c51b7a6cce37e1108cd2d6c57a77e151c/README.md)
- **T-S:** [tintinweb SDK/continuation implementation](https://github.com/tintinweb/pi-subagents/blob/e955e29c51b7a6cce37e1108cd2d6c57a77e151c/src/agent-runner.ts)
- **T-Q:** [tintinweb security model](https://github.com/tintinweb/pi-subagents/blob/e955e29c51b7a6cce37e1108cd2d6c57a77e151c/SECURITY.md)
- **T-P:** [tintinweb manifest](https://github.com/tintinweb/pi-subagents/blob/e955e29c51b7a6cce37e1108cd2d6c57a77e151c/package.json)
- **T-N:** [Published tintinweb metadata](https://registry.npmjs.org/@tintinweb/pi-subagents/latest)
- **M-R:** [mjakl README](https://github.com/mjakl/pi-subagent/blob/fc0e5d29f45dc627317e0419d6af63890181fabe/README.md)
- **M-S:** [mjakl dispatch](https://github.com/mjakl/pi-subagent/blob/fc0e5d29f45dc627317e0419d6af63890181fabe/index.ts) and [RPC execution](https://github.com/mjakl/pi-subagent/blob/fc0e5d29f45dc627317e0419d6af63890181fabe/runner.ts)
- **M-N:** [Published mjakl metadata](https://registry.npmjs.org/@mjakl/pi-subagent/latest)
- **C-R:** [Codex-shaped extension README](https://github.com/ogulcancelik/pi-extensions/blob/373a8cf735e66792dae8b096bc62f8d5cf7693a8/packages/pi-codex-subagents/README.md)
- **C-S:** [Child launch/continuation implementation](https://github.com/ogulcancelik/pi-extensions/blob/373a8cf735e66792dae8b096bc62f8d5cf7693a8/packages/pi-codex-subagents/core.ts)
- **C-N:** [Published Codex-shaped metadata](https://registry.npmjs.org/@ogulcancelik/pi-codex-subagents/latest)
- **H-R:** [pi-task README](https://github.com/heyhuynhgiabuu/pi-task/blob/0ea3c9454f1c5316449176404ed19ddfc42d09fd/README.md)
- **H-S:** [pi-task SDK execution](https://github.com/heyhuynhgiabuu/pi-task/blob/0ea3c9454f1c5316449176404ed19ddfc42d09fd/src/subagent/runSdk.ts)
- **H-P:** [pi-task manifest](https://github.com/heyhuynhgiabuu/pi-task/blob/0ea3c9454f1c5316449176404ed19ddfc42d09fd/package.json)
- **H-N:** [Published pi-task metadata](https://registry.npmjs.org/@heyhuynhgiabuu/pi-task/latest)
- **A-R:** [agrigoryan README](https://github.com/agrigoryan/pi-subagents/blob/69e6817c4ba1ee4d96f5470e35593840fec7592c/README.md)
- **A-S:** [agrigoryan dispatch/jobs](https://github.com/agrigoryan/pi-subagents/blob/69e6817c4ba1ee4d96f5470e35593840fec7592c/src/index.ts) and [runner](https://github.com/agrigoryan/pi-subagents/blob/69e6817c4ba1ee4d96f5470e35593840fec7592c/src/runner.ts)
- **A-P:** [agrigoryan manifest](https://github.com/agrigoryan/pi-subagents/blob/69e6817c4ba1ee4d96f5470e35593840fec7592c/package.json)
- **P-R:** [Messenger/Crew README](https://github.com/nicobailon/pi-messenger/blob/09937ed647a1b07a3b595bf75943feacb80ff123/README.md)
- **O-R:** [Official subagent example](https://github.com/earendil-works/pi/blob/1cedd32724abfcb0915f76cc61b6827e2c16dbad/packages/coding-agent/examples/extensions/subagent/README.md)
- **O-P:** [Official package installation/pinning](https://github.com/earendil-works/pi/blob/1cedd32724abfcb0915f76cc61b6827e2c16dbad/packages/coding-agent/docs/packages.md)
- **O-E:** [Official extension security/runtime](https://github.com/earendil-works/pi/blob/1cedd32724abfcb0915f76cc61b6827e2c16dbad/packages/coding-agent/docs/extensions.md)
- **API:** GitHub repository endpoints: [nicobailon subagents](https://api.github.com/repos/nicobailon/pi-subagents), [tintinweb](https://api.github.com/repos/tintinweb/pi-subagents), [mjakl](https://api.github.com/repos/mjakl/pi-subagent), [ogulcancelik](https://api.github.com/repos/ogulcancelik/pi-extensions), [pi-task](https://api.github.com/repos/heyhuynhgiabuu/pi-task), [agrigoryan](https://api.github.com/repos/agrigoryan/pi-subagents), [Messenger](https://api.github.com/repos/nicobailon/pi-messenger).
