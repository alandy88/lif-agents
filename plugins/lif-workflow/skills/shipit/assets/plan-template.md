# shipit: <run title>

- Repo: <repo>
- Slug: <slug>
- Integration branch: shipit/<slug>, from <default branch> at <sha>
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

## Slices

### 1. <title>

- Status: <todo | building | reviewing | done | blocked>
- Branch: shipit/<slug>-1
- Worktree: <path>
- Parallel-safe: <yes | no>
- Scope: <files in> / untouched: <files>
- Consumes: <interfaces from earlier slices, or "none">
- Exposes: <interfaces later slices use, or "none">
- Done when:
  - `<command>` exits 0
- Retries used: 0 of 2

## Log

- <YYYY-MM-DD HH:MM> <role> <slice>: <one-line outcome>
