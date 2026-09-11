---
name: pickup
disable-model-invocation: true
description: "Use when resuming work handed off from another session — lists pending handoffs from lif-notes system/handoff, lets user pick one, and ingests it as session context."
---

# Pickup

Find a pending handoff in `system/handoff/`, display it, move it to `claimed/`, and ingest the content as starting context for this session.

## Steps

1. **List pending handoffs** using Bash (Glob is scoped to the current working directory tree and cannot reach `$LIF_NOTES_VAULT` from other repos):

```bash
ls -1 "$LIF_NOTES_VAULT/system/handoff/"*.md 2>/dev/null
```

Exclude `README.md` from results. If the directory has no `*.md` files besides `README.md`, treat as zero.

2. **Branch by count:**

   - **Zero files →** Print "No pending handoffs." and stop.

   - **One file →** Proceed to step 3 with that file.

   - **Multiple files →** Present a numbered list. For each file, show the filename and extract the goal from the `# Handoff:` heading (first H1 line). Ask user to pick by number. Proceed with chosen file.

3. **Read the chosen file** using the Read tool. Display the full content to the user.

4. **Move to claimed:**

```bash
mv "$LIF_NOTES_VAULT/system/handoff/{filename}" "$LIF_NOTES_VAULT/system/handoff/claimed/{filename}"
```

5. **Ingest the handoff body** as session context. Use the content from the handoff sections (What Was Done, Decisions, Next Action, Relevant Files, etc.) to orient yourself and continue work from where the previous session left off.

## Shortcut

If invoked as `/pickup {slug}`, match the first pending file whose name contains `{slug}` (case-insensitive). Skip the list presentation.

If no match, print "No pending handoff matches '{slug}'." and list available files.
