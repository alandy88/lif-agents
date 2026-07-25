# TASK

Plan issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}

Break this issue into an ordered task checklist and write it into the issue body. DO NOT implement anything — planning only.

# CONTEXT

<issue>

{{ISSUE_BODY}}

</issue>

If you need discussion context, run `gh issue view {{ISSUE_NUMBER}} --comments`.

# CREDENTIALS

`gh` is already authenticated in this sandbox via the `GH_TOKEN` env var. Call
it directly: `gh issue view`, `gh issue edit`, etc. Never prefix a `gh`
invocation with `GH_TOKEN=… gh …` or echo the token in a shell command — log
files capture stdin/stdout and a leaked credential is a real incident.

# BLIND SPOT PASS

Read `AGENTS.md` at the repo root first — it documents the project structure, node contracts, and test commands. Explore the code the issue touches just enough to slice confidently.

Before slicing, do a blind spot pass. You are the only session that reads this issue with fresh eyes and the whole codebase in view; every ambiguity you resolve silently here gets decided by a later session that has far less context.

Ask: what does the issue NOT say that would change the implementation? Look for unstated choices about data shapes, public contracts, node IDs, storage format, error behavior, and user-facing wording — and for assumptions the issue makes that the code contradicts.

This run is fully autonomous — nobody will answer you. So for each open question, pick the conservative option (the one that is easiest to reverse and changes the least existing behavior), and record both the question and the choice. Then plan as if that choice were settled.

# PLANNING

Produce 2–8 ordered tasks. Each task must be:

- Independently implementable and verifiable (its tests can pass with only earlier tasks done).
- Small enough for one focused agent session — a later session sees only the checklist, not your exploration.
- Ordered so no task depends on a later one. Top-to-bottom IS the build order.
- Self-contained as written: name the files/modules involved, because the implementing session reads only the task text plus the issue.
- Anchored to a reference where one exists: name the closest analogous file already in the repo for the session to mirror (e.g. "follow the adapter shape in `<the existing file>`"). Existing source is a richer spec than prose — prefer pointing at it over describing it. Omit the reference only when nothing analogous exists.

Include the tests in the same task as the code they cover — do not split "write tests" into its own trailing task.

# OUTPUT

Update the issue body: keep the existing body intact and append a `## Tasks` section with the checklist, then an `## Open questions` section with the blind spot pass:

```
## Tasks

- [ ] First task …
- [ ] Second task …

## Open questions

- **<the unstated choice>** — proceeding with <the conservative option>, because <one clause>.
```

Both sections carry forward: `## Tasks` drives the build order, and `## Open questions` is shown to every implementing session and to the reviewer, so a later session can see which choices were guesses rather than requirements.

Only list questions whose answer would actually change the code. If the issue is fully specified, write `- None — the issue is unambiguous.` rather than padding the list. Omitting the section entirely is not an option; its absence reads as "not checked".

To do this safely, write the complete new body to a temp file and run:

```
gh issue edit {{ISSUE_NUMBER}} --body-file <temp-file>
```

Leave every box unchecked. Do not commit any code changes. Do not close or label the issue.

Once complete, output `<promise>COMPLETE</promise>` on its own line.
