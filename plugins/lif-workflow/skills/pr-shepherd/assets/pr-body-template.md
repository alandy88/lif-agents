# PR Body Template

Three sections, nothing else. No emoji, no "Generated with" footer unless the
repo's recent PRs use one. Keep the whole body under ~250 words.

```markdown
## Problem

<What was broken or missing, and the user-visible consequence. One short
paragraph or 2-3 bullets. Link the issue as `Closes #N` if one exists.>

## Solution

<What the diff does and the one design decision worth knowing. Reference files
as `path/to/file.py:42`. Do not restate the diff line by line.>

## Testing

- `<command actually run>` — <result>
- <manual check performed, or "not run: <reason>">
```

Rules:

- Written from the diff, not from the conversation's intentions.
- Anything you did not verify is labelled unverified. No aspirational testing.
- Out-of-scope observations go in a fourth `## Notes` section, or nowhere.
