# CONTEXT — domain glossary

The vocabulary this repo's code, tests and PRD already use. Definitions are
harvested from the implementation, not invented for this file; where a term is
load-bearing in code, the module that owns it is named.

**Kit** — this package, `@lif/sandcastle-kit`: the repo-agnostic half of the
agent pipeline. The boundary rule is a single test: if a module cannot be
written without naming a package manager, a test command, or a repo layout, it
does not belong here.

**Consumer** — a repo that installs the kit at a pinned tag and runs it. Its
whole contract is one `.sandcastle/config.mts` (plus a `Dockerfile`), and it
never names `@ai-hero/sandcastle` — `src/presets/boundary.test.mts` enforces
that against the built `dist/`.

**Phase** — one modular stage of a lifecycle: plan, task, review, verify,
deliver (`src/phases/`). A phase is an async function taking a `PhaseContext`
(sandbox, branch, agent, template resolver) plus typed inputs. There is no
pipeline engine — composition is plain TypeScript.

**Preset** — a shipped composition of phases into a whole lifecycle
(`src/presets/`). A consumer runs a preset as-is, overrides its templates, or
skips presets entirely and composes phases itself.

**Lifecycle** — the shape of a run end to end. Two exist: **issue-driven**
(`presets/implement`) reads a GitHub issue checklist and ends at a PR for a
human; **ledger** (`presets/task`) reads `STATE.md`, verifies, and squash-merges
its own task before taking the next one.

**Run** — one invocation of a lifecycle: one warm sandbox, one agent branch, one
resolved profile. A run is resumable, which is what makes the branch rather than
the process the unit of state.

**Agent branch** — the branch a run works on, `agent/issue-<n>` (issue-driven)
or `agent/<task-slug>` (ledger). It is the run's durable checkpoint: it is
pushed after every green task, and the resume set is read back out of its
commit trailers, so a re-fired run skips finished work instead of starting over.
Every git operation on it lives in `src/lib/branch.mts`.

**Profile** — the model routing for a run, resolved from issue labels, a
dispatch flag, or a default (`src/lib/profiles.mts`). Routing is per-phase, so
one run can build with Codex and review with Opus.

**Toolchain** — `python`, `node` or `dotnet`, chosen by the consumer
(`src/lib/toolchains.mts`). The name selects a kit-owned standard, not a
description: picking `python` picks uv, and with it the sandbox warm-up, the
canonical test command, and the conventions block the prompts carry.

**Ledger** — `STATE.md` in a consumer repo: the ledger lifecycle's source of
work, read for its `Next task: **...**` recommendation. A malformed ledger stops
the loop rather than guessing.

**Checklist** — the `## Tasks` section of a GitHub issue body: the issue-driven
lifecycle's source of work, one checkbox per task. The plan phase writes it when
the issue lacks one, so the issue stays the single source of the plan.

**Task-Done trailer** — `Task-Done: <n>`, a git trailer on an empty commit the
host makes after each green task. Trailers are the durable resume state (the
checkbox on the issue is display only), and they are read back with
`git log origin/main..<branch>`.

**Run artifact** — `AGENT_NOTES.md` (the cross-session deviations log task
sessions append to) and `AGENT_SUMMARY.md` (the reviewer's PR-body summary).
Both live on the agent branch rather than in `/tmp` so they survive a resume,
and the host strips them before the PR so they never reach `main`.
