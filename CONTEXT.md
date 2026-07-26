# Domain glossary

Short definitions for the terms load-bearing in this codebase, sourced from
the existing comments and `docs/2026-07-26-sandcastle-kit-shared-package-prd.md`.

## Shape of the kit

**kit** — This package, `@lif/sandcastle-kit`: the repo-agnostic agent-orchestration
engine (`src/lib/`, `src/phases/`, `src/presets/`) that consuming repos install
at a pinned tag rather than copy.

**consumer** — A repo that installs the kit and writes exactly one file,
`.sandcastle/config.mts`, naming its toolchain and picking a preset.

**preset** — A standard composition of phases for one lifecycle shape, e.g.
`presets/implement` (GitHub issues) or `presets/task` (a local ledger). A
consumer runs a shipped preset as-is, overrides its templates, or composes
phases directly.

**phase** — One modular stage of a lifecycle (plan, task, review, verify,
deliver): an async function taking a shared `PhaseContext` (agent, sandbox,
branch, template resolver) plus phase-specific inputs, returning a typed
result. Phases are the unit of reuse across presets, not whole lifecycles.

**lifecycle** — The end-to-end flow a preset runs. Two ship today:
**issue-driven** (`presets/implement`: github-issue → plan? → loop(task) →
review → PR) and **ledger** (`presets/task`: `STATE.md` ledger → loop(task) →
verify → squash-merge-and-continue).

## Running a lifecycle

**run** — One execution of a lifecycle against one issue or ledger entry, from
admission through delivery.

**profile** — The named or mixed set of model/provider choices a run uses per
phase (`resolvePhases` resolves dispatch → label → default → mixed into a
`ResolvedPhases`).

**toolchain** — A consumer's per-repo build/test standard, chosen by name
(`python` means uv, `node` means npm) rather than described freehand — the kit
owns the warm-up commands and conventions block each name implies.

**agent branch** — The sandbox's working branch for a run, `agent/issue-<n>`
(or the task preset's equivalent), pushed after every green task so it is the
durable checkpoint a re-fired run resumes from.

**ledger** — `STATE.md`-style file the `task` preset reads and appends to in
place of a GitHub issue's checklist; the ledger preset's task source.

**checklist** — The `## Tasks` markdown task-list inside an issue body that
`task-list.mts` parses, checks off, and resumes from. Top-to-bottom order is
build order; the issue-driven lifecycle's plan.

**Task-Done trailer** — A `Task-Done: <n>` git trailer on an empty commit,
recording that task `<n>` completed; the durable resume state a re-fired run
reads back via `parseTaskDoneTrailers`, independent of whatever the issue body
currently shows checked.

**run artifact** — A file tracked on the agent branch across sessions within
one run (`AGENT_NOTES.md`, `AGENT_SUMMARY.md`), stripped by the host before
the PR so it never reaches main.

**defang** — Neutralizing `` !`…` `` shell-expansion blocks in attacker-writable
issue bodies before they reach a template as a prompt argument, so a
substituted issue body is an inert literal rather than live shell syntax.

## Admitting a run

**intake** — The act of deciding, before any sandbox work starts, whether a
run may proceed and with what profile — reading the issue and epic status,
never writing. Lives in `src/lib/issue-intake.mts`, factored out of
`presets/implement`'s `main()`.

**admission** — The verdict intake returns: `admitted` (with the issue and
resolved run), `skipped` (a clean no-op), or `rejected` (with an
issue-facing detail and, for the config-resolution path only, the raw
underlying `cause`). `main` acts on the verdict — report-then-throw on
rejection, log-and-return on skip, run-and-report on admission.
