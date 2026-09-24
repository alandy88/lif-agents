---
name: retro
disable-model-invocation: true
description: "Weekly Sandcastle retro curation: cluster unprocessed Learnings and promote selected themes into ready-for-agent PRDs."
argument-hint: "[--since YYYY-MM-DD] [--type \"Friction Name\"]"
allowed-tools: Bash(gh issue create:*), Bash(mv:*), Read, Grep, Glob, Write
---

# retro

Run this weekly (typically Monday) to convert Sandcastle Learnings into improvement PRDs.

## Inputs

- Learnings folder: `$LIF_NOTES_VAULT/work/development/sandcastle-learnings/`
- Unprocessed source: markdown files at folder root
- Processed archive: `processed/` subfolder

Optional filters:
- `--since YYYY-MM-DD`
- `--type "Friction Name"`

## Flow

1. Load candidate Learning files with `Glob`.
2. Exclude `processed/` descendants.
3. Read each candidate and extract:
   - Friction-type wikilinks (`[[...]]` in Frictions section)
   - Improvement seeds
   - Issue/run metadata
4. Cluster by friction type and seed co-occurrence.
5. Present top themes with AskUserQuestion and let the user choose which themes to promote.
6. For each chosen theme:
   - Load source Learnings into context.
   - Synthesize one observation describing how to improve the Sandcastle pipeline itself.
   - Invoke `/to-prd` with that synthesized observation and the source context.
   - Ensure the produced PRD points back to source Learnings via wikilinks in `## Pointers` or `## Implementation Decisions`.
7. After PRD success, move that theme's source files into `processed/` using `mv`.
8. End with a summary listing created issue links and archived Learning count.

## Constraints

- Do not auto-file every cluster; user curation is required.
- Do not delete Learnings.
- If `/to-prd` is unavailable, stop after presenting themes and report the blocker.
