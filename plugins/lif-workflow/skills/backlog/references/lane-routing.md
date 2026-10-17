# Lane routing: triage verdict to GitHub label

Mirrors `$LIF_NOTES_VAULT/docs/agents/triage-labels.md`; that file wins if they differ.
Open or closed is the issue's lifecycle; labels route it.

| Verdict | Lane | GitHub action |
| --- | --- | --- |
| Fully specified, self-contained, ≤ ~100k, and the repository documents a consumer for `ready-for-agent` | AFK agent | add `ready-for-agent` |
| Needs a human: judgment, design, manual access, or no documented agent consumer | human | add `ready-for-human` |
| Material gaps or questions for the reporter | held | add `needs-info` |
| Exploratory idea, not ready to build | held | add `spike` |
| Will not be actioned | none | `gh issue close <n> --repo <owner/repo> --reason "not planned"` |

A repository documents a consumer when its `AGENTS.md` or `docs/agents/issue-tracker.md`
says the label starts an agent run (`alandy88/lif-studio` does). There, adding
`ready-for-agent` starts a run at once, so it needs the same yes as creating the issue.

## Decision guidance

- Prefer **AFK** when the issue is unambiguous, its acceptance criteria are testable, and
  no design decision or outside access is needed.
- Choose **human** when the work needs a judgment call, a design choice, manual
  verification, or access the agent lacks.
- An issue that is AFK-ready in scope but over ~100k tokens is not AFK-ready; it should
  have been split in step 3.
