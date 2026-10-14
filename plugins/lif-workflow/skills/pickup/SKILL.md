---
name: pickup
disable-model-invocation: true
description: "Lists pending handoffs in the lif-notes vault's system/handoff/ queue, lets the user pick one, loads it as session context, and removes it from the queue. Use when resuming work handed off from another session, or when the user runs /pickup."
---

# Pickup

Find a pending handoff in `$LIF_NOTES_VAULT/system/handoff/`, display it, remove it from the queue, and ingest the content as starting context for this session.

## Steps

1. **List pending handoffs** using Bash (Glob is scoped to the current working directory tree and cannot reach `$LIF_NOTES_VAULT` from other repos):

```bash
ls -1 "$LIF_NOTES_VAULT/system/handoff/"*.md 2>/dev/null
```

Exclude `README.md` from results. If the directory has no `*.md` files besides `README.md`, treat as zero.

2. **Branch by count:**

   - **Zero files →** Print "No pending handoffs." and stop.

   - **One file →** Proceed to step 3 with that file.

   - **Multiple files →** Present a numbered list. For each file, show the filename and the goal: the first H1 line, else the `goal:` frontmatter field, else the filename. Ask user to pick by number. Proceed with chosen file.

3. **Read the chosen file** using the Read tool. Display the full content to the user.

4. **Remove it from the queue.** The vault keeps no `claimed/` archive; git history is
   the archive (`$LIF_NOTES_VAULT/system/handoff/README.md`). Check whether git holds it
   as it is now:

```bash
git -C "$LIF_NOTES_VAULT" status --porcelain -- "system/handoff/{filename}"
```

   No output (committed, unchanged): `rm` the file and tell the user the deletion is not
   committed. Any output (untracked or edited): git does not hold this version, so ask
   before deleting it.

5. **Ingest the handoff body** as session context. Use the content from the handoff sections (What Was Done, Decisions, Next Action, Relevant Files, etc.) to orient yourself and continue work from where the previous session left off.

## Shortcut

If invoked as `/pickup {slug}`, match the first pending file whose name contains `{slug}` (case-insensitive). Skip the list presentation.

If no match, print "No pending handoff matches '{slug}'." and list available files.
