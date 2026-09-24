# Triaging Codex Review Findings

Codex (`chatgpt-codex-connector`) posts a summary review plus inline comments
badged `P1` / `P2` / `P3`. The badge is Codex's confidence in severity, not a
verdict — judge each finding against the actual code.

## Classify before acting

| Verdict | Signal | Action |
|---|---|---|
| Valid | Reproduces in the code; the described failure is real | Fix, smallest diff |
| Partially valid | Real issue, wrong cause or overreaching fix | Fix the real part only; reply naming what you did not take |
| Wrong | Rests on a misread of the code or a constraint Codex cannot see | Reply with the evidence (file:line, test, ADR). No code change |
| Out of scope | True but unrelated to this PR | Reply, and open an issue if it matters |

Never take a suggestion just to clear the thread. Never widen the PR's scope to
satisfy a `P3` nit.

## Replying

```bash
gh api repos/<owner>/<repo>/pulls/comments/<comment-id>/replies \
  -f body='<reason>'
```

One or two sentences, factual, no apology. Cite the file:line or test that
settles it.

## After fixing

1. Push fixes as their own commits — do not amend the reviewed commit; Codex
   tracks review state by the SHA in `Reviewed commit:`.
2. Expect no second review. Codex runs one automatic pass per PR (open, or
   draft → ready); fix pushes do not re-trigger it. Waiting for a round two
   that never arrives stalls the PR.
3. To force another pass, comment `@codex review`. Worth it only when the
   fixes reshaped the diff — not to confirm a one-line change.

## Reporting to the user

One line per finding: severity, file, verdict, what you did. Findings you
rejected get the reason, not just "not applicable".
