---
name: obsidian-vault
disable-model-invocation: true
description: "Points a session in any repo at the lif-notes Obsidian vault's own contract before it reads or writes notes there: where the vault is, which files hold the rules, and which folders need care. Use when working with lif-notes notes from outside the vault, or when the user asks where a note belongs or how to write one."
argument-hint: "[path-or-topic]"
allowed-tools: Read, Glob, Grep, Write
---

# obsidian-vault

The vault is at `$LIF_NOTES_VAULT`. If the variable is unset, source
`~/.config/lif-host.sh` when it exists; otherwise ask the user for the path.
Use absolute paths under it: a session in another repo cannot use paths
relative to the vault.

The vault's rules live in the vault, not here. Inside the vault its
`AGENTS.md` loads by itself; from any other repo, read these before you act:

| Question | File, under `$LIF_NOTES_VAULT` |
|---|---|
| What goes where, log buckets, write and commit rules | `AGENTS.md` |
| Frontmatter fields and sensitivity tiers | `docs/agents/frontmatter.md` |
| Which note belongs to which repo | `notes/projects/knowledge-boundary.md` |

Rules that matter most from outside the vault, all stated in those files:

- `personal/` notes are red: vault-only, never quoted outside it. `work/`,
  `daily/` and other notes carry their own tier in frontmatter; read
  `docs/agents/frontmatter.md` before you open them.
- Capture means proposing the edit and waiting for a yes; never write a note
  silently.
- For an approved write, follow the vault-write steps in `AGENTS.md`: Git
  status and a fast-forward pull first, the vault lint after
  (`python3 "$LIF_NOTES_VAULT/system/scripts/lint-vault.py"`, report-only), and
  no commit or push without the user's yes.
- In an existing note, keep its frontmatter and its folder's naming style.
