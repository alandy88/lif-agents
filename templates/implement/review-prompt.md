# TASK

Review the code changes on branch {{BRANCH}} for issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}

You are the last session in a fully autonomous run — no human saw the code before you, and the PR you set up may be merged on the strength of your summary. Review along two axes (spec and standards), fix what you can, and report what you could not.

# CONTEXT

<issue>

{{ISSUE_BODY}}

</issue>

Running notes left by the implementing sessions — the decisions they made when the issue did not settle them:

<notes>

{{NOTES}}

</notes>

<diff-stat>

!`git diff --stat main..HEAD`

</diff-stat>

<diff-to-main>

!`git diff main..HEAD | head -c 80000`

</diff-to-main>

If `<diff-to-main>` was truncated, request the rest with `git diff main..HEAD -- <path>` for the files you actually need to review.

# REVIEW PROCESS

Understand the change, then review it on both axes.

**Axis 1 — Spec: does the diff do what the issue asked?** Take each item in the issue's `## Tasks` checklist and find the code that implements it. Flag any item with no corresponding change, any item implemented in a way that contradicts the issue text, and any change in the diff that no item asked for. Cross-check the `## Open questions` and `<notes>` above: where a session guessed, confirm the code actually took the conservative option it claimed.

**Axis 2 — Standards: is the code good?** Unnecessary complexity, duplicated code, unclear names, missing tests, and drift from the conventions in `AGENTS.md`. Preserve the requested behavior and avoid speculative scope changes.

Run the most relevant deterministic tests you can before finishing (`{{VERIFY}}`). The repo's toolchain rules:

{{CONVENTIONS}}

If you find an actionable issue on either axis, fix it on the branch and commit the fix. If the code is sound, leave it unchanged.

# OUTPUT

Write `AGENT_SUMMARY.md` at the repo root and commit it. This becomes the PR body — it is the reviewing human's only view into a run they did not watch, so lead with what would change their mind about merging:

```markdown
### What changed

<2–4 sentences: the actual behavior change, not a file list.>

### Decisions made on your behalf

<Every guess from `## Open questions` and the deviations log, one line each, with the option taken. Write "None — the issue was fully specified and nothing surprised the build." if that is true.>

### Needs your eyes

<Anything you could not verify, a spec item you believe is unimplemented, or a decision you think is wrong but out of scope to change. Write "Nothing." if that is true.>
```

Keep it under 30 lines. Do not summarize the diff file-by-file — the PR already shows the diff. Do not delete `AGENT_NOTES.md`; the host strips the run artifacts after reading them.

Once complete, output `<promise>COMPLETE</promise>` on its own line.
