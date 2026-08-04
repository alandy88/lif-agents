# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- **Two halves, one root.** `local/` is the captain's machine setup; `remote/` is the kit,
  the package other repos install. They share nothing but the repository.
- **Asked to "install this" on a machine? Read
  [local/install/AGENTS.md](local/install/AGENTS.md) — not the README's kit section.**
  `npm i -D github:alandy88/lif-agents` installs the *kit* and does nothing to this
  machine's terminal.
- **Machine-specific values belong to a named environment**, one directory per machine
  under `local/environments/`, which also states exactly which values an environment owes.
  No platform is the default: the Windows drive paths belong to `windows-5090` alone.
  See [local/environments/README.md](local/environments/README.md).
- **`package.json` must stay at the repo root**, with the tsconfigs the root scripts
  invoke. Neither npm nor bun can install from a subdirectory of a git URL, and all three
  consumers pin `github:alandy88/lif-agents#vX.Y.Z`. The kit's *sources* may live under
  `remote/` — the manifest may not.
- **Four places name the build output and they move together:** `tsconfig.json`'s `outDir`,
  `package.json`'s `files` and `exports`, `.gitignore`, and `BUILD_OUTPUT` in
  `remote/scripts/release-gate.mts` (which the release workflow force-adds). Today all say
  `remote/dist`.
- **`templatePath()` finds templates by walking up from its own module URL**
  (`remote/src/lib/templates.mts`), so `remote/src/` and `remote/dist/` must stay siblings
  of `remote/templates/`. It throws when the resolved path escapes the workspace — that
  throw is the run-start check that the kit was installed inside the mounted workspace.
- **Bun consumers get the whole tree.** Bun ignores `package.json`'s `files` and copies the
  entire tag tree into `node_modules`. Keep large binaries out of `local/` and `remote/`.
- **`local/` came in as a git subtree** of `alandy88/lif-terminal`, imported without
  `--squash` so this history carries lif-terminal's commits. That upstream repo is being
  deleted: `local/` here is now the only home for the terminal config, there is nothing
  left to `git subtree pull` from, and edits go straight into this repo. Only a real
  merge commit (not a squash merge) keeps lif-terminal's history reachable from `main`.
  See `/home/peter/firstmate/data/agentcfg-monorepo-v1/report.md`.
- The design rationale for holding both halves in one repo, and the kit's full consumer
  reference, are in `/home/peter/firstmate/data/agentcfg-monorepo-v1/report.md` and
  [remote/docs/kit-reference.md](remote/docs/kit-reference.md).

## Releases

`remote/dist/` is gitignored on `main` and force-added onto each `vX.Y.Z` tag commit.
Git-URL installs get built output whether the runner uses `npm` or `bun`, and `main`
stays clean. `package.json` on `main` reads `0.0.0-development` and is never bumped —
only the release commit carries a real version, stamped next to the `remote/dist/` it
describes. To find the current version, read the tags.

Releases are cut automatically: every push to `main` builds, and a new tag follows if
the installable payload differs from the last tag's
(`remote/scripts/release-gate.mts`). **The gate compares built output, not the commit
subject** — so a commit that touches only `local/`, `remote/runner/` or `remote/docs/`
never tags a release, and one that quietly changes a resolved model id does. Commit type
only picks the bump size: `feat` or `!` takes the minor, anything else the patch (below
1.0.0 a breaking change is a minor). A `workflow_dispatch` with an explicit `version`
overrides both.

Raw `.mts` is not shipped — tsx/bun transpilation of `.mts` inside `node_modules` is
inconsistent. The JS emit rewrites `.mts` imports to `.mjs`; declarations keep `.mts` and
resolve to the sibling `.d.mts`, so a consumer typechecking against `remote/dist/` sees
real types.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
