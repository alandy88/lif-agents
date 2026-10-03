---
name: retro
disable-model-invocation: true
description: "Digest the learnings log from a /shipit run: drop notes without evidence, dedupe, and route each survivor by the vault's knowledge boundary — repo AGENTS.md edits inside the run's PR, vault topic notes after approval, /shipit friction as a lif-agents issue. Triggers: /retro, the Retro step of /shipit."
argument-hint: "[run dir, default the current /shipit run]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# retro

Turn the notes agents left during one `/shipit` run into durable knowledge, or
into nothing. Most notes should end as nothing: the vault keeps only decisions
and settled facts, and a note with no home is not worth keeping.

## Input

`$RUN/learnings.jsonl`, one JSON object per line:

```json
{"role": "builder", "slice": 2, "kind": "gotcha", "text": "...", "evidence": "src/db.ts:41"}
```

`kind` is `gotcha` (a trap the code or environment sets), `learning` (a fact that
held up), or `friction` (something about `/shipit` itself that slowed the run).
`evidence` is a `file:line`, a command and its output, or a link.

## Steps

1. **Filter.** Drop notes with no `evidence`, notes about one-off mistakes, and
   status recaps. Check each remaining note's evidence still holds on the
   integration branch.
2. **Merge** notes that say the same thing into one.
3. **Dedupe** against what already exists: the repo's `AGENTS.md` (and nested
   ones) and the vault notes mapped to this repo in
   `$LIF_NOTES_VAULT/notes/projects/knowledge-boundary.md`. A note already
   covered there is dropped; a note that contradicts it becomes an edit to it.
4. **Route** each survivor:

   | Note is about | Goes to | When |
   |---|---|---|
   | Build, test, release, file layout, or code-coupled behaviour of this repo | the repo's `AGENTS.md`, nearest one to the code | committed on the integration branch now |
   | Knowledge that holds beyond this repo | the vault topic note the knowledge boundary names | proposed now, written after approval |
   | `friction` with `/shipit` or its skills | a GitHub issue on `alandy88/lif-agents` | proposed now, filed after approval |

   Repos the knowledge boundary lists with no vault note (work projects) keep
   everything in the repo. When no topic note fits a vault-bound note, drop it.
5. **Apply the repo edits** in the integration worktree. Keep each entry to the
   bar in that file's own maintenance section, prefer rewriting an entry over
   appending one, and commit as `docs(agents): <what was learned>`.
6. **Write the proposal** to `$RUN/retro.md`: the repo edits made, each vault
   edit as the exact text and target file, each issue as title and body, and the
   dropped notes with a one-word reason each.

## After approval

The Orchestrator brings `$RUN/retro.md` to Gate 2. For what the user approves:

- **Vault edits** follow `$LIF_NOTES_VAULT/AGENTS.md`: check `git status`, pull
  `--ff-only` when safe, edit the topic note, update its `updated:` date, keep
  its `sensitivity:` tier, and run `system/scripts/lint-vault.py`. Commit and
  push the vault only when the user said yes to that too.
- **Issues** go to `alandy88/lif-agents` with `gh issue create`. Quote no `red`
  or `amber` vault content in them.

## Done when

Every note in `learnings.jsonl` is routed or dropped with a reason, repo edits
are committed on the integration branch, and `$RUN/retro.md` lists every
proposed vault edit and issue.

## Report

Lead with counts: notes in, repo edits made, vault edits and issues proposed,
notes dropped. Then the proposals the user must decide on.
