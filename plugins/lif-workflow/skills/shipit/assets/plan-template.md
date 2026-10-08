# shipit: <run title>

- Repo: <repo>
- Slug: <slug>
- Integration branch: shipit/<slug>, from <default branch> at <sha>
- Integration worktree: <path>
- Design: <structured-planning artifact path, or "small run, none">
- Gate 1: <pending | approved YYYY-MM-DD HH:MM>
- Gate 2: <pending | approved YYYY-MM-DD HH:MM>
- PR: <none | #N url>

## Goal

<one or two sentences: what ships and why>

## Decisions

- <decision> — <one-line reason>

## Commands

- Typecheck: <cmd>
- Unit: <cmd>
- Integration: <cmd or "none">
- E2E: <cmd or "none">

## Waves

- Wave 1: slices 1, 2, 3
- Wave 2: slices 4, 5

## Slices

### 1. <title>

- Wave: <w>
- Status: <todo | building | reviewing | merged | blocked>
- Branch: shipit/<slug>-1
- Worktree: <path>
- Scope: <files in> / untouched: <files>
- Consumes: <interfaces from earlier waves, or "none">
- Exposes: <interfaces later waves use, or "none">
- Done when:
  - `<command>` exits 0
- Retries used: 0 of 2
- Test asks: <from the Reviewer, or "none">
- Large findings: <finding — fixed by | declined by user, or "none">

## Log

- <YYYY-MM-DD HH:MM> <role> <slice>: <one-line outcome>
