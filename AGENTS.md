# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- **The kit must stay at the repo root.** Neither npm nor bun can install from a
  subdirectory of a git URL, and all three consumers pin `github:alandy88/lif-sandcastle#vX.Y.Z`.
  Moving `src/`, `templates/`, or `package.json` into a subdirectory breaks every consumer.
- **Bun consumers get the whole tree.** Bun ignores `package.json`'s `files` and copies the
  entire tag tree into `node_modules`. Keep large binaries out of `local/` and `remote/`.
- **`local/` is a git subtree** of `alandy88/lif-terminal`, imported with
  `git subtree add --prefix=local https://github.com/alandy88/lif-terminal.git main`
  without `--squash`, so this branch carries lif-terminal's commits. If PR #12 lands
  with a real merge commit, refresh with `git subtree pull --prefix=local
  https://github.com/alandy88/lif-terminal.git main`; if it is squash-merged, retain
  the `git-subtree-dir: local` and `git-subtree-split: <sha>` trailers and use that
  same command. Squash-merging without those trailers removes lif-terminal's history
  from main; a real merge preserves the history and the simple refresh. Every pull
  raises a modify/delete conflict at `local/install.ps1` because upstream keeps it at
  its root; keep `local/install.ps1` deleted and port upstream changes to
  `install/install.ps1` by hand. See `/home/peter/firstmate/data/agentcfg-monorepo-v1/report.md`.
- Non-kit areas (`local/`, `hosts/`, `install/`, `remote/`) are documented in the README's
  "Also in this repo" section; the design rationale is in
  `/home/peter/firstmate/data/agentcfg-monorepo-v1/report.md`.
- Releases are cut from built `dist/` diffs, not commit subjects — see README "Releases".
  Commits that touch only `local/`, `hosts/`, `install/`, or `remote/` never tag a release.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
