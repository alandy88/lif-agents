---
name: obsidian-vault
disable-model-invocation: true
description: "Reference conventions for navigating and writing notes in the lif-notes Obsidian vault."
argument-hint: "[path-or-topic]"
allowed-tools: Read, Glob, Grep, Write
---

# obsidian-vault

Use this as the canonical vault navigation and note-shape reference for lif-notes.

## Core principle

Each note is a single unit of learning. Keep notes atomic. Do not merge unrelated ideas into omnibus pages.

## Vault layout

Vault root comes from `$LIF_NOTES_VAULT` (default `~/github/personal/lif-notes` on Linux/macOS, `D:\Git\lif-notes` on Windows).

Main domains:
- `daily/`
- `work/`
- `personal/`
- `system/`

Shared reference area:
- `notes/`

Prefer placing new notes inside the correct domain rather than the root.

## Naming

- Prefer clear human names.
- Title Case is encouraged for hand-written evergreen notes.
- Existing kebab-case or machine-generated naming in a folder is valid; follow local convention.

## Linking

- Use wikilinks aggressively (`[[Note Name]]`) to connect related notes.
- Create index notes as hubs when a topic grows.
- Prefer backlinks-driven indexes over manually maintained append-only lists.

## Discovery workflow (tool-first)

1. Use `Glob` to locate candidate notes by folder and extension.
2. Use `Grep` to narrow by headings, wikilinks, or keywords.
3. Use `Read` only on the shortlisted notes.
4. Use `Write` for focused updates that preserve atomicity.

## Editing rules

- Preserve existing frontmatter schema when present.
- Keep section headings stable unless the user asks to restructure.
- If a note mixes topics, split into separate notes and cross-link.
