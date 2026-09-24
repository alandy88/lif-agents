---
name: handoff
disable-model-invocation: true
description: "Compact the current conversation into a handoff document for a fresh session to pick up via /pickup."
---

# Handoff

Write a handoff document summarising the current session so a fresh agent can continue the work. Do not duplicate content already captured in other artifacts (plans, specs, ADRs, issues, commits, diffs). Reference them by path instead.

## Steps

1. **Gather git state** of the source repo (parallel Bash calls):

```bash
git rev-parse --show-toplevel     # → repo path
git symbolic-ref --short HEAD     # → branch
git remote get-url origin         # → origin URL (may fail if no remote — that's fine)
```

2. **Reconstruct session context** from conversation memory into the template sections below. Every section is required — use `(none)` if truly empty.

3. **Build filename:** `YYYY-MM-DD--{repo_name}--{slug}.md`
   - `repo_name`: basename of repo path (e.g. `lif-studio`)
   - `slug`: kebab-case from goal, max 40 chars, lowercase, alphanumeric + hyphens only
   - If file already exists, append `-2`, `-3`, etc.

4. **Check for collision** using Glob:

```
Glob pattern: system/handoff/{date}--{repo_name}--{slug}*.md
```

5. **Write file** to `$LIF_NOTES_VAULT/system/handoff/{filename}` using the Write tool with the filled template below.

6. **Print:** `Handoff written → system/handoff/{filename}`

7. **Done.** No commit, no push, no follow-up suggestions.

## Template

```
---
repo: {repo_path}
branch: {branch}
created: {YYYY-MM-DD}
goal: {one-sentence goal}
---
# Handoff: {goal}

## Plan / Spec Files
- {links to plan or spec docs created or referenced during session, or "(none)"}

## What Was Done
- {concrete changes with file:line refs where useful}

## Decisions
- {non-obvious choices worth remembering, or "(none)"}

## Open Questions / Blockers
- {things unresolved, or "(none)"}

## Next Action
{single concrete first step for the resuming session}

## Relevant Files
- `{path/to/file}` — {why it matters}
```
