# Evidence Labeling

Every non-obvious claim in the artifact must carry one of two labels. This is the single highest-leverage rule for reducing hallucination and making the artifact auditable.

## The two labels

### `[evidence: <source>]`

The claim is grounded in something checkable. Source must be specific:

- `[evidence: src/foo.ts:42]` — file and line
- `[evidence: src/foo.ts]` — file only (acceptable for file-level facts)
- `[evidence: git log — commit abc123]` — a specific commit
- `[evidence: package.json#dependencies.react]` — a config field
- `[evidence: README §Install]` — a doc section
- `[evidence: user said "..."]` — direct user statement in this conversation
- `[evidence: <url>]` — external source the user pointed you at

**Not acceptable**: "the code", "the docs", "convention", "best practice", "generally".

### `[assumption: <what you're assuming>]`

The claim is not grounded — you are guessing, extrapolating, or using a default. State exactly what the assumption is so it can be challenged.

- `[assumption: requests/day < 10k]`
- `[assumption: all users have Node 18+]`
- `[assumption: we will not need i18n for v1]`
- `[assumption: existing auth middleware covers this path]`

If an assumption is load-bearing (the design breaks if it's wrong), mark it `[assumption!: ...]` so it jumps out in the self-scan.

## When labels are required

Label required:
- Any statement about how existing code works ("the cache invalidates on write")
- Any claim about performance, scale, or user behavior
- Any claim about an external system's behavior
- Any "we will need" / "this requires" / "users expect"
- Any decision justification ("X is better because ...")

Label not required:
- Pure design statements that define new behavior ("the new endpoint returns a list of IDs")
- Trivial tautologies
- Section headers and structure

## Self-scan for unlabeled claims

During the self-critique pass, re-read every paragraph and ask: **"Is this a fact, a guess, or a definition?"**

- Fact → needs `[evidence: ...]`
- Guess → needs `[assumption: ...]`
- Definition → no label needed

If you cannot produce an evidence source for a claim you thought was a fact, downgrade it to `[assumption: ...]`. This is normal and expected.

## Example

**Bad** (unlabeled):
> The auth middleware already rate-limits by IP, so we can skip rate-limiting in the new endpoint.

**Good** (labeled):
> The auth middleware already rate-limits by IP `[evidence: src/middleware/auth.ts:88]`, so we can skip rate-limiting in the new endpoint `[assumption: IP-based limit is sufficient for this endpoint's abuse profile]`.

The second form makes both the supporting fact and the leap-of-faith visible to the reviewer.
