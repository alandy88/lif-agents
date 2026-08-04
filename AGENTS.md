# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- **Asked to "install this" on a machine? Read [install/AGENTS.md](install/AGENTS.md) — not
  the README's `Install` heading.** This repo holds two unrelated things. The captain's
  terminal setup (WezTerm, Starship, Herdr, shell profile) is installed by `install/`;
  `npm i -D github:alandy88/lif-agents` installs the *kit*, a JavaScript package for
  other repos, and does nothing to this machine's terminal.
- **Machine-specific values belong to a named environment**, one directory per machine
  under `environments/`, which also states exactly which values an environment owes.
  No platform is the default: the Windows drive paths belong to `windows-5090` alone.
  See [environments/README.md](environments/README.md).
- **The kit must stay at the repo root.** Neither npm nor bun can install from a
  subdirectory of a git URL, and all three consumers pin `github:alandy88/lif-agents#vX.Y.Z`.
  Moving `src/`, `templates/`, or `package.json` into a subdirectory breaks every consumer.
- **Bun consumers get the whole tree.** Bun ignores `package.json`'s `files` and copies the
  entire tag tree into `node_modules`. Keep large binaries out of `local/` and `remote/`.
- **`local/` came in as a git subtree** of `alandy88/lif-terminal`, imported without
  `--squash` so this history carries lif-terminal's commits. That upstream repo is being
  deleted: `local/` here is now the only home for the terminal config, there is nothing
  left to `git subtree pull` from, and edits go straight into this repo. Only a real
  merge commit (not a squash merge) keeps lif-terminal's history reachable from `main`.
  See `/home/peter/firstmate/data/agentcfg-monorepo-v1/report.md`.
- Non-kit areas (`local/`, `environments/`, `install/`, `remote/`) are documented in the README's
  "Also in this repo" section; the design rationale is in
  `/home/peter/firstmate/data/agentcfg-monorepo-v1/report.md`.
- Releases are cut from built `dist/` diffs, not commit subjects — see README "Releases".
  Commits that touch only `local/`, `environments/`, `install/`, or `remote/` never tag a release.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
