# System diagram gate: one diagram page per project, checked by the factory

Status: draft. Nothing is built. Open: D1, D2, D3, D4 below.

## Goal

Every project holds one diagram of its system in a simple HTML page. The factory's
bootstrap makes sure the page exists. Each job keeps the page true, and the page is
checked against the repo by a script, not only by a reader.

Not in this plan: the lavish-axi CLI or skill, and any drag-to-edit board. The diagram
is changed by editing its text.

## Today

- 13 projects under `/home/peteryu/github/personal`. None has a system diagram page.
  4 hold some Mermaid (plans and flows, not system maps).
- 2 projects have a `## Factory` section in `AGENTS.md`: `lif-agents` and
  `lif-workbench`.
- All 8 `factory-*` agents and the second-model review read `AGENTS.md` and its
  `## Factory` section. Of the 4 shipit agents only `reviewer` is told to read
  `AGENTS.md`; `builder`, `tester` and `breaker` are not.
- Bootstrap step 4 checks that `AGENTS.md` names setup and check commands. Step 5
  drafts what is missing, shows it, waits for a yes, and commits that one file on the
  base branch.

## Design

### The page

One file per project, `docs/system.html`, committed on the base branch. A job's
worktree is cut from the base branch, so only a committed page is visible to agents.

The page holds the diagram as Mermaid text and loads Mermaid from a CDN to draw it.
The text is the truth: agents read it, diffs show it, the checker parses it.

```html
<!doctype html><html><head><meta charset="utf-8"><title>lif-agents system</title></head><body>
<h1>lif-agents system</h1>
<pre class="mermaid">
flowchart LR
  consumers(["3 consumer repos"])
  kit["remote: installable kit"]
  dispatch["local/dispatch"]
  skill["skills/lif-dispatch"]
  consumers -->|install a git tag| kit
  skill -->|fronts| dispatch
  %% path kit remote
  %% path dispatch local/dispatch
  %% path skill skills/lif-dispatch
  %% external consumers
</pre>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11.15.0/dist/mermaid.esm.min.mjs";
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
  await mermaid.run({ querySelector: ".mermaid" });
</script>
</body></html>
```

Rules for the diagram text:

- One `flowchart`. Each box is declared on its own line, before any arrow uses it.
- `%% path <box-id> <repo-relative-path>` ties a box to a file or folder. Mermaid
  ignores `%%` lines, so the page draws the same with or without them.
- `%% external <box-id>` marks a box that is not in this repo (a consumer, a service).
- `%% ignore <top-level-folder>` names a tracked top-level folder that needs no box.
- Keep it to the system level: about 20 boxes at most. Detail goes in prose below the
  diagram, in the same page.

### The checker

One script, `plugins/lif-workflow/skills/factory/assets/check-diagram.sh`, run as
`check-diagram.sh <page> <repo-root>`. It exits 0 on a good page and prints one line
per fault otherwise. Three checks:

1. Every `%% path` points at something that exists.
2. Every box has a `%% path` or `%% external` line.
3. Every tracked top-level folder is covered by a `%% path` or a `%% ignore` line.

The version below was run on 2026-10-11 against a test page for `lif-agents`: exit 0
on a page with 11 boxes, exit 1 with three correct fault lines on a page with one
renamed path and one deleted `%% path` line. `%% ignore` is not in it yet.

```bash
#!/usr/bin/env bash
# usage: check-diagram.sh <page-with-mermaid> <repo-root>
set -euo pipefail
page=$1 root=$2 fail=0
paths=$(grep -E '^\s*%% path ' "$page" | awk '{print $4}')
bound=$(grep -E '^\s*%% (path|external) ' "$page" | awk '{print $3}')
for p in $paths; do
  [ -e "$root/$p" ] || { echo "FAIL box points at a missing path: $p"; fail=1; }
done
for id in $(grep -oE '^\s*[A-Za-z_][A-Za-z0-9_-]*[\[\(\{]' "$page" | tr -d ' [({'); do
  grep -qx "$id" <<<"$bound" || { echo "FAIL box has no path line: $id"; fail=1; }
done
for d in $(git -C "$root" ls-tree -d --name-only HEAD); do
  grep -qE "^$d(/|\$)" <<<"$paths" || { echo "FAIL folder has no box: $d"; fail=1; }
done
exit $fail
```

It ships with a test: a good page, a page per fault, and the expected exit codes.

### Where the factory uses it

| Step | Change |
| --- | --- |
| Bootstrap step 4 | Also require `docs/system.html` on the base branch, and run the checker on it. Missing or failing: go to step 5. |
| Bootstrap step 5 | Page missing: draft it from the repo (top-level folders, `AGENTS.md`, manifests). Page present but failing: keep it, and draft only the smallest patch that clears the checker's fault lines, shown with those lines. Either way show a diff, wait for a yes, and commit. Same rules as today: never push, stop on a dirty file or a wrong branch. |
| Checks gate | Run the checker on the worktree's page at this point in every job, after the project's `Checks` command when there is one. The gate is skipped today when a project has no `Checks` line; the diagram check is not. A failure is handled exactly like a failed `Checks` command. The script is read from the skill folder, so a job cannot weaken it. |
| `factory-spec-writer` | Read the page. Name the boxes the feature touches, and say when the feature adds, removes or re-links a box. |
| `factory-builder` | Read the page. When the change adds, removes, moves or re-links a box, edit the page in the same commit series. |
| `factory-reviewer-code` | Read the page beside the diff. `CHANGES` when the diff changes the system's shape and the page did not follow, or when the page claims a link the code does not have. |
| `second-review.md` | Add the page to its reading list. |

The other reviewers, the retro and the approver are unchanged.

### What stays a judgment

Arrows. The checker proves boxes, not links. Many links in these projects are
commands, HTTP calls and file contracts, which no import scan sees. A zero-config run
of `dependency-cruiser` on `lif-agents` drew 2 boxes and no arrows in 3 tries, so
checking arrows against imports is not part of this plan. The code reviewer reads the
arrows.

## Rollout

1. Checker script and its test, in the factory skill's `assets/`. First edit to the
   tested version: add `%% ignore`, which the diagram rules already rely on.
2. `SKILL.md`: bootstrap steps 4 and 5, the Checks gate, the `Files` list.
3. The three agent files and `second-review.md`.
4. Bump `version` in `plugins/lif-workflow/.claude-plugin/plugin.json` (now `1.11.0`),
   or installed copies never get the change.
5. `docs/system.html` for `lif-agents`, through the new bootstrap, as the first real
   run. Then `lif-workbench`.
6. The other 11 projects get their page the first time `/factory` runs in them.

## Findings

- **One page file is enough.** The test page drew all 11 boxes and 7 arrows in a
  browser from a single HTML file with no build step.
- **The page needs the network to draw.** Mermaid comes from jsDelivr. The text is
  still readable in the file without it. See D3.
- **A drag board is possible later, at a cost.** A single-file Excalidraw page built
  from the same text worked but cut labels off; fixing that means lifting a few hundred
  lines of label repair from lavish-axi (MIT). Excalidraw itself has no plugin system
  (`excalidraw/excalidraw#2189`, open since 2020-09-28). Not planned.
- **Copies drift.** The hub plan found that `dashboard.html` copies go stale, which is
  why the checker is run from the skill folder and not copied into each project.

## Open decisions

- **D1. Who runs the checker.** Suggested: the orchestrator, from the skill folder, at
  bootstrap and at the Checks gate. Nothing is copied into projects. Alternative: copy
  the script into each repo and add it to the project's `Checks` line, so CI and
  non-factory work run it too, at the price of drifting copies.
- **D2. How agents learn the rule.** Suggested: edit the three agent files, since the
  rule is the same for every project. Alternative: a `Diagram:` line in each project's
  `## Factory` section, which reaches all 8 agents with no agent edits but repeats the
  rule per project.
- **D3. Mermaid from the CDN or a vendored copy.** Suggested: CDN, pinned to
  `11.15.0`. Alternative: commit Mermaid's bundle beside the page so it draws offline,
  a few MB per project (size not measured).
- **D4. Shipit.** Suggested: leave shipit alone until the factory version has run on
  two projects. Its `reviewer` already reads `AGENTS.md`; its `tester` would need an
  edit to learn about the page.

## Known limits

- The page lives in `docs/`, so every project needs a box or a `%% ignore` for `docs`
  to pass check 3.
- The tested script splits paths on spaces. A `%% path` to a name with a space breaks
  it, and `lif-studio/docs/` holds one such file. Fix or forbid before rollout.
- The checker reads box ids with a pattern, not a Mermaid parser. A box first declared
  inside an arrow line is missed, hence the one-box-per-line rule.
- A page can pass the checker and still be wrong about what talks to what.
- A project with many top-level folders (`comfyui-lif-nodes` has 32) needs a long
  `%% ignore` list, or boxes that each cover a group of folders.
