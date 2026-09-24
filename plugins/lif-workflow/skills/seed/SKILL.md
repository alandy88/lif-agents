---
name: seed
disable-model-invocation: true
description: "Convert a freeform idea into a spike-ready GitHub issue draft, then post on confirmation."
argument-hint: "<idea text>"
allowed-tools: Bash(gh issue create:*), Read, Grep, Write
---

# seed

Turn a rough idea into a spike-ready issue in one round-trip.

## Scope

- This skill is standalone and does not invoke `structured-planning`.
- Draft first, ask for no pre-draft clarification.
- Never fabricate. Use only user input and recon findings.

## Recon Budget

Before drafting:

1. Run at most 3 grep queries derived from the idea.
2. Read at most 2 files that appear relevant from grep output.
3. Stop early if a clearly relevant file is found.
4. Stop early if 2 grep queries return nothing useful.

Recon results feed `## Pointers`. If nothing is found, use:

`(none found — start by grepping for <term>)`

## Draft Format

Generate title and body in one pass. Body must contain exactly these sections in this order:

1. `## The ask`
2. `## Why`
3. `## Pointers`
4. `## Out of scope`
5. `## Spike output`
6. `## Open questions`

Rules:

- Keep each section concise (about one or two lines).
- If unknown, say so explicitly (for example `(none specified)`).
- Unknowns go into concrete questions under `## Open questions`.

## Confirm Loop

After each draft, print:

1. `Title: <draft title>`
2. One fenced markdown block containing the full body.
3. Prompt:
`Reply 'post' to publish, 'cancel' to abort, or describe changes.`

Interpret the next user response:

- `post`, `yes`, `ship it` -> publish current draft.
- `cancel`, `no`, `abort` -> stop with no issue creation.
- Any other text -> treat as edit instructions and redraft full title + full body.

Every redraft must re-print the complete title and complete body (no partial diffs).

## Publish

When user confirms post:

1. Write body text to a temporary file.
2. Run:

```bash
gh issue create --title "<title>" --label seed --body-file "<temp-file>"
```

3. Return the created issue URL.
4. If `gh` fails, surface stderr/stdout verbatim and stop (no retry).

## Label Policy

- Apply exactly one label: `seed`.
- Do not add `ready-for-agent` or any other label.
