# Land and cleanup

How a job the approver passed reaches its base branch, and how its worktree
and branch are removed afterwards. SKILL.md sends you here from **Approve**
and from `/factory approve`. Sections named in bold that are not in this file
(**Needs human**, **Review round N**) are in SKILL.md.

## Land

**Base check, first.** Other jobs may have landed since the last build round:

```bash
git -C <repo> merge-base --is-ancestor <base> factory/<job-id>
```

- Exit 0: the branch holds everything on the base. Carry on.
- Otherwise the base has moved. Run
  `git -C <repo> merge-tree --write-tree <base> factory/<job-id>`.
  - It reports conflicts: go to **Needs human**, and tell the user to run
    `/factory rework <job-id> merge <base> and resolve the conflicts`, so the
    fix goes through review.
  - No conflicts: set `stage: "build"` and send the builder
    `Base sync: <base> has moved. Merge it into the job branch, rerun the project's checks, commit, and add a "Base sync" entry to the Log in build.md.`
    Resume it or spawn it fresh as in **Review round N**, without counting
    against `MAX_RESUMES`. When it finishes, read the first line of `build.md`:
    `STATUS: BLOCKED` goes to **Needs human**. `STATUS: READY`: set
    `stage: "approve"` and carry on. A clean merge with passing checks is not
    reviewed again.

The check reads the local base branch. In a `Land: pr` project that is only as
fresh as the user's last pull; the pull request's own checks cover the rest.

Read the project's `Land` line from the base branch, never from the job branch,
so a job cannot grant itself a push:

```bash
git -C <repo> show <base>:AGENTS.md
```

| `Land` line | Do |
|---|---|
| absent | Stop and ask once per job: "push `factory/<job-id>` and open a PR?" On a yes, land as `pr`. On a no, go to **Needs human**. |
| `pr` | A standing yes. Land by pull request, below. |
| `merge` | Land by local merge, below. Never push. |

A push is visible to others. Nothing but the `Land` line or the user's own yes
allows one.

**By pull request.** Run the `pr-shepherd` skill with the `Skill` tool, with
every command inside the worktree (`cd <worktree> && …`). It pushes the branch,
opens the PR, triages the Codex bot's review, watches CI, and asks the user
before merging. While it runs its rules apply, so it may fix Codex and CI
findings in the worktree. Once the PR exists, set `stage: "pr-open"`.

- The PR merges: go to **Cleanup**.
- The user says not yet, or the session has to stop: leave `stage: "pr-open"`
  and tell the user `/factory approve <job-id>` picks it up.
- `pr-shepherd` cannot open the PR: go to **Needs human** and quote why.

**By local merge.** The merge happens in the main checkout, so it must be clean
and on the base branch: `git -C <repo> status --porcelain` prints nothing and
`git -C <repo> branch --show-current` prints `<base>`. If not, set
`stage: "needs-human"` and tell the user the job is approved but the main
checkout is busy; they run `/factory approve <job-id>` once it is clean.
Otherwise:

```bash
git -C <repo> merge --no-ff factory/<job-id> -m "Merge factory/<job-id>"
```

If the merge fails, run `git -C <repo> merge --abort` (when a merge is in
progress), set `stage: "needs-human"` and tell the user why. Otherwise go to
**Cleanup**.

## Cleanup

After a merge, by PR or locally:

```bash
git -C <repo> worktree remove <worktree>
git -C <repo> branch -d factory/<job-id>
```

A split job also has ticket worktrees and branches: remove them as
[tickets.md](tickets.md) says.

Set `stage: "merged"`. The plugin's safety hook asks the user before any branch
delete; that prompt is expected, not a failure. After a squash-merged PR,
`branch -d` can refuse because the commits differ. `gh pr view` printing
`MERGED` is the proof it landed, so use `-D` then. If removing the worktree
fails, the job is still merged: tell the user what `git worktree remove`
printed.
