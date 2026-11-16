# Peter's preferences

Resolve routine ambiguity from available context. Ask one question when different interpretations would materially change scope, authorization, or the deliverable.

## Start here

Read the one that matches the question. `$LIF_NOTES_VAULT` is the vault; the `homelab`
repo sits beside it (on the Linux box both are under `/home/peteryu/github/personal/`).

- **My projects** (what each repo is, cross-repo rules, env vars):
  `$LIF_NOTES_VAULT/../homelab/AGENTS.md`. Every repo there has its own `AGENTS.md`; the repo doc wins over the index.
- **This machine and my other machines** (paths, SSH hosts, where env vars are set, auth):
  `$LIF_NOTES_VAULT/system/environment.md`.
- **The vault contract** (how to capture, sensitivity, log buckets, handoffs):
  `$LIF_NOTES_VAULT/AGENTS.md`. Which vault note belongs to which repo:
  `$LIF_NOTES_VAULT/notes/projects/knowledge-boundary.md`.

## Environment

- Repository roots are exported as `LIF_STUDIO_ROOT`, `LIF_WORKBENCH_ROOT`,
  `COMFYUI_LIF_NODES_ROOT`, `LIF_NOTES_VAULT`, and `LIF_BUILDING_BLOCKS_ROOT`. If unset, source
  `~/.config/lif-host.sh` when available; otherwise consult the machine reference above.
- To install Python dependencies, prefer `uv` (`uv add`, `uv run --with`, `uvx`) over `pip`.
- `/handoff`: use `lif-workflow:handoff` when available.
- `/plan-handoff`: use `lif-workflow:plan-handoff` when available, for approved implementation plans.
- If either skill is unavailable, consult
  `$LIF_NOTES_VAULT/system/handoff/README.md` for the handoff format and lifecycle;
  explain any unsupported workflow steps rather than invoking a missing skill.

## Design principle: Unix philosophy

Build like `grep`: small, composable, silent on success.

- **One thing well.** Each function, module, or service has a single responsibility. If you need "and" to describe what it does, split it.
- **Compose, don't accrete.** Prefer small pieces wired together over one large piece that does everything. New capability should come from recombination before it comes from rewriting.
- **Simple, stable interfaces.** Components talk through plain, well-defined contracts (typed inputs/outputs, JSON, streams). No hidden shared state, no reaching into another module's internals.
- **Explicit results.** Return meaningful values and errors. Fail loudly with a clear reason; succeed quietly without noise.
- **Text and plain data over clever formats.** Favor what any other tool can read, diff, and pipe.
- **Prototype, then harden.** Get a working version early and expect to throw parts away. Don't over-engineer for needs that haven't appeared.

Apply this when: adding a feature, designing an API, splitting a file, or choosing between a library and a hand-rolled solution.

Don't apply it blindly: if decomposition creates more coordination cost than it removes (dozens of trivial modules, brittle text parsing where a struct would do), consolidate. The goal is leverage through interfaces, not fragmentation.