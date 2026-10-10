---
name: factory
disable-model-invocation: true
description: "Run the software factory on the current project: one job goes through spec, build on its own branch and worktree, parallel review lenses, a second-model review, a retro, and an approver that lands it or hands it to a human. The session that runs it becomes the orchestrator. Triggers: /factory <feature>, /factory next, /factory approve <job-id>, /factory rework <job-id> <note>."
argument-hint: "<feature> | next | approve <job-id> | rework <job-id> <note>"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill, SendMessage
---

# factory

Needs Claude Code and the Agent tool. Codex gets this skill by symlink but not the
`lif-workflow:factory-*` agents: there, say so and stop.

Adapted from `zazencodes/zazencodes-season-3`,
`src/software-factory-claude-code`, at commit `555467c`.

You are the orchestrator for one job. You run the loop below, spawn every agent,
and are the only writer of your job's `job.json`. You never write code, specs,
reviews or decisions yourself. Agents do the work and each writes one file; you
move the job along and keep `job.json` current.

## The loop

```
feature → spec-writer → builder → [security, ux, ui, code] → WAIT FOR ALL
                           ▲                                      │
                           ├──── any CHANGES: resume builder ◄────┤
                           │                                      ▼ all PASS
                           └──── CHANGES ◄─────────────── second model (pi)
                                                                  ▼ PASS
                                                                retro
                                                                  ▼
                                              land ◄─ APPROVE ─ approver ─ ESCALATE → needs-human
```

| Step    | Agent (`subagent_type`)                 | Writes                                               |
| ------- | --------------------------------------- | ---------------------------------------------------- |
| spec    | `lif-workflow:factory-spec-writer`      | `spec.md`                                            |
| build   | `lif-workflow:factory-builder`          | `build.md` + commits on `factory/<job-id>`           |
| review  | `lif-workflow:factory-reviewer-security` | `round-N/review-security.md`                        |
|         | `lif-workflow:factory-reviewer-ux`      | `round-N/review-ux.md`                               |
|         | `lif-workflow:factory-reviewer-ui`      | `round-N/review-ui.md`                               |
|         | `lif-workflow:factory-reviewer-code`    | `round-N/review-code.md`                             |
|         | none: the `pi` CLI, run by you          | `round-N/review-second.md`                           |
| retro   | `lif-workflow:factory-retro`            | `retro.md` + `AGENTS.md` commits on `factory/<job-id>` |
| approve | `lif-workflow:factory-approver`         | `decision.md`                                        |

Each agent file sets its own `model`, so pass none on the `Agent` call.

`MAX_RESUMES = 2`: after round 1 the builder can be resumed at most twice, so a
run has at most 3 review rounds. To change the factory, edit this file and the
`factory-*.md` files in the plugin's `agents/`.

Every agent reads the project's `AGENTS.md` (or `CLAUDE.md`) for its setup,
server, validation commands and conventions. Nothing project-specific lives in
these files.

## The `## Factory` section of a project's `AGENTS.md`

Optional. It holds only what the general checklists cannot know. Every factory
agent reads it when present.

```markdown
## Factory

- **Pages:** how to serve the app from a worktree on a given port, with safe data.
  Or "none".
- **Checks:** one shell command that must exit 0 on a good branch, run from the
  root of a checkout. You run it yourself after every build.
- **Watch for:** review hot spots for this codebase.
- **Always escalate:** changes a human must see before they land.
- **Land:** `pr` or `merge`. Absent: ask before each push.
```

## Parallel jobs

Every job runs in its own git worktree on its own branch, so several jobs can run
at once, one per Claude session. To run three features, open three sessions in
the project and start `/factory` in each. Your session orchestrates only the job
it started or was handed.

- Agents work in the job's worktree. The main checkout is the user's, and it may
  be dirty or on another branch. Only **Bootstrap** step 5 and a `Land: merge`
  touch it.
- Job state lives beside the project, never in a checkout. Each job has its own
  `job.json`, so sessions never write the same file.
- Each job gets its own server ports and agent-browser sessions (see
  **Prompts**), so reviewers of different jobs never see each other's pages.

## Files

`<repo>` is the project's main checkout, `<name>` its folder name, and
`<factory>` the sibling folder `<repo>/../<name>-factory`. Nothing the factory
writes at run time lands inside `<repo>`, so there is nothing to gitignore.

```
<factory>/dashboard.html                 the board, copied from this skill on first run
<factory>/backlog.md                     queue for /factory next
<factory>/jobs/<job-id>/job.json         the job's state (you write it, the dashboard reads it)
<factory>/jobs/<job-id>/spec.md
<factory>/jobs/<job-id>/build.md
<factory>/jobs/<job-id>/rework-<k>.md    written by you, from /factory rework
<factory>/jobs/<job-id>/round-<N>/review-{security,ux,ui,code}.md
<factory>/jobs/<job-id>/retro.md
<factory>/jobs/<job-id>/decision.md
<factory>/worktrees/<job-id>/            the job's worktree, on factory/<job-id>
```

Watch the board with
`cd <factory> && python3 -m http.server --bind 127.0.0.1`, then open
`dashboard.html` on that port. Keep the `--bind`: the folder also holds the
worktrees.

### job.json

```json
{ "id": "003-rate-limiting", "feature": "Rate limit the signup form",
  "branch": "factory/003-rate-limiting", "base": "main",
  "worktree": "/home/you/code/my-app-factory/worktrees/003-rate-limiting",
  "ports": { "builder": 41873, "ux": 39897, "ui": 45081 },
  "stage": "review", "round": 2,
  "reviews": { "security": "CHANGES", "ux": "PASS", "ui": "pending", "code": "PASS",
               "second": "pending" } }
```

- `stage` is one of `spec`, `build`, `review`, `approve`, `pr-open`, `merged`,
  `needs-human`. Worktree setup counts as `spec`. The retro counts as `approve`.
- `round` is the current review round (0 until the first round starts).
- `reviews` holds the current round only. Each value is `pending`, `PASS`,
  `CHANGES` or `SKIPPED`. Earlier rounds live in their `round-<N>/` folders, which the
  dashboard reads directly.
- `base` is the branch the job was cut from and lands on.
- Rewrite the whole file on every change. `worktree` is always an absolute path.

### Prompts

Every agent prompt starts with the job's absolute paths:
`Job folder: <factory>/jobs/<job-id>/. Worktree: <worktree>. Branch: factory/<job-id>. Base: <base>.`
Below, `<paths>` stands for that sentence.

Agents that open pages also get a port from `job.json`, appended as
` Port: <port>.`: the builder gets `ports.builder`, `factory-reviewer-ux` gets
`ports.ux` and `factory-reviewer-ui` gets `ports.ui`.

## Bootstrap: step 0 of every `/factory` call

There is no install step. Every call starts here, and says nothing when the
project is already ready.

1. **Find the main checkout.** `<repo>` is the parent of
   `git rev-parse --path-format=absolute --git-common-dir`. This holds from
   inside a worktree too.
2. **Make the factory folder.** `mkdir -p <factory>/jobs <factory>/worktrees`.
   When `<factory>/dashboard.html` is absent, copy
   [assets/dashboard.html](assets/dashboard.html) from this skill's folder
   there. When `<factory>/backlog.md` is absent, create it empty.
3. **Resolve the base branch.**
   `git -C <repo> symbolic-ref --short refs/remotes/origin/HEAD` prints
   `origin/<base>`; drop the `origin/`. When it does not resolve, or `<repo>` has
   no local branch of that name, stop and ask the user which branch to use. For
   `/factory approve` and `/factory rework`, the job's `base` in `job.json` wins.
4. **Readiness check.** Read `<repo>/AGENTS.md` (or `CLAUDE.md`). It must say how
   to set up a fresh checkout and which commands must pass. When either is
   missing, go to step 5. A project with pages and no way to serve them still
   runs: the builder and the two page reviewers then work by reading only, and
   say so.
5. **Draft the missing lines.** Work the commands out from the repo: package and
   lock files, CI config, hooks, existing scripts. Show the user the exact lines
   as a diff and wait for a yes. A job's worktree is cut from the base branch,
   so uncommitted lines in the main checkout would be invisible to every agent.
   The yes therefore covers both writing the lines and committing that one file
   on the base branch:
   ```bash
   git -C <repo> add -- AGENTS.md
   git -C <repo> commit -m "docs(agents): add setup and check commands" -- AGENTS.md
   ```
   Never push it. Before you write anything: if `<repo>` is not on the base
   branch, or the file already has uncommitted edits, stop and say so. On a no,
   stop and create no job.

## /factory <feature>

1. **Create the job.** Pick the next 3-digit number after the highest numbered
   folder in `<factory>/jobs/` (`001` if there are none) and a 2–4 word
   kebab-case slug of the feature: `004-blog-reading-time`. Claim it with
   `mkdir <factory>/jobs/<job-id>` (no `-p`). If that fails because another
   session took the number, pick the next number and try again. The worktree
   path is `<factory>/worktrees/<job-id>`. Ask the OS for three free ports:
   ```bash
   node -e 'const net=require("net");Promise.all([0,1,2].map(()=>new Promise(r=>{const s=net.createServer().listen(0,"127.0.0.1",()=>r(s))}))).then(ss=>{console.log(ss.map(s=>s.address().port).join(" "));ss.forEach(s=>s.close())})'
   ```
   Write `job.json` with that `worktree`, the `base`, the three `ports`,
   `stage: "spec"`, `round: 0` and all reviews `pending`.
2. **Worktree.** Create the branch and its worktree from the base branch:
   ```bash
   git -C <repo> worktree add -b factory/<job-id> <worktree> <base>
   ```
   Then, in the worktree, run the setup AGENTS.md gives for a fresh checkout
   (installing dependencies, for example). If any of it fails, stop and tell
   the user.
3. **Spec.** Spawn `lif-workflow:factory-spec-writer` with the prompt
   `<paths> Feature: <feature, verbatim>`.
   Wait for it to finish, then check that `spec.md` exists.
4. **Build.** Set `stage: "build"`. Spawn `lif-workflow:factory-builder` with the
   prompt `<paths> Build round 1. Port: <port>.` Where the `Agent` tool takes a
   name, name it `builder-<job-id>`. Wait for it to finish, then go to
   **Build check**.

### Build check

Read the first line of `build.md`.

- `STATUS: BLOCKED`: go to **Needs human**.
- `STATUS: READY`: run the **Checks gate**, then start the next review round.

**Checks gate.** The builder's word is not proof. Read the `Checks` line from the
base branch, with `git -C <repo> show <base>:AGENTS.md`, so a job cannot weaken
its own gate. No such line: skip this gate. Otherwise run the command in the
background and wait for it:

```bash
cd <worktree> && <the Checks command>
```

- Exit 0: carry on.
- Any other exit, resumes left: set `stage: "build"` and send the builder
  `The project's Checks command failed: <command>. Its last lines: <the last 30 lines it printed>. Fix the cause, commit, and update build.md.`
  Resume it or spawn it fresh as in **Review round N**. It counts against
  `MAX_RESUMES`. When it finishes, run **Build check** again.
- Any other exit, no resumes left: write `decision.md` yourself, reading
  `ESCALATE`, then a blank line, then
  `The project's Checks command still fails: <command>.` Go to **Needs human**.

### Review round N

The reviews are four lenses, `security`, `ux`, `ui` and `code`, then the
second-model review, `second`.

**Which lenses run.** The full set is `security` and `code`, plus `ux` and `ui`
unless the project's `Pages` line reads `none`.

- Round 1, and the first round after a `/factory rework`: the full set.
- Any other round: the lenses that said `CHANGES` in the round before, plus
  `code`, which reruns the project's checks.

**Stubs.** Every review that does not run this round still gets its file, so
each round folder holds all five. You write the stub yourself:

```markdown
VERDICT: SKIPPED

<why: "The project has no pages." or "Passed in round <k>; not rerun.">
```

1. Set `stage: "review"`, `round: N`, the lenses that run and `second` to
   `pending`, and the rest to `SKIPPED`. Create
   `<factory>/jobs/<job-id>/round-<N>/` and write the stubs.
2. Spawn every lens that runs **in one message**, so they run in parallel. Each
   gets the prompt `<paths> Review round N.`, plus its port for
   `factory-reviewer-ux` and `factory-reviewer-ui`.
3. **WAIT FOR ALL.** Each time a reviewer finishes, read the first line of its
   file (`VERDICT: PASS` or `VERDICT: CHANGES`) and write that verdict to
   `job.json` straight away, so the dashboard chips fill in as they land. The
   lenses are done only when every one you spawned has written its file in
   `round-<N>/`. Never resume the builder mid-round. If a reviewer finishes
   without writing its file, or writes a first line that isn't a verdict, stop
   and tell the user.
4. **Second-model review.** Any lens `CHANGES`: write the stub for `second`
   (`A lens asked for changes this round.`) and set it to `SKIPPED`. All lenses
   `PASS`: run the **Second-model review** below and record its verdict.
5. Decide:
   - **All PASS** (a `SKIPPED` counts as a pass): go to **Retro**.
   - **Any CHANGES, resumes left**: set `stage: "build"`, then send the builder
     this message:
     `Round N reviews are in <factory>/jobs/<job-id>/round-<N>/. Address every review with VERDICT: CHANGES, commit, and update build.md for round N+1.`
     Where this session has `SendMessage`, resume the same builder with it, to
     `builder-<job-id>`. Where it has none, spawn a fresh
     `lif-workflow:factory-builder` with the prompt
     `<paths> Port: <port>. <that message> Read spec.md, build.md and every round folder first.`
     Both kinds count against `MAX_RESUMES`. Wait for it to finish, then go to
     **Build check**.
   - **Any CHANGES, no resumes left**: write `decision.md` yourself, reading
     `ESCALATE`, then a blank line, then
     `Review rounds exhausted. Outstanding CHANGES in round-<N>/ from: <reviewers>.`
     Go to **Needs human**.

### Second-model review

A model from another vendor reads the change after the lenses pass, to find
what they share a blind spot for. It runs through the `pi` CLI, with no agent.
Its prompt is [assets/second-review.md](assets/second-review.md) and its reply
is the review file.

When `command -v pi` prints nothing, write the stub for `second`
(`pi is not installed on this machine.`), set it to `SKIPPED`, and say so in
your report line. Otherwise run this in the background and wait for it:

```bash
cd <worktree> && pi -p --provider openai --model gpt-6.1-sol --thinking medium \
  --no-session --tools read,grep,find,ls,bash \
  "<paths> Review round N." "@<this skill's folder>/assets/second-review.md" \
  < /dev/null > <factory>/jobs/<job-id>/round-<N>/review-second.md
```

- Keep `< /dev/null`: without it `pi -p` waits on its input and never starts.
- The tool list leaves out `edit` and `write`. `bash` stays so it can run `git`
  and the project's checks, so read-only is asked for, not enforced. Afterwards
  `git -C <worktree> status --porcelain` must print nothing; if it prints
  anything, go to **Needs human** and quote it.
- To use another model, change `--provider` and `--model` on that one line.
  `openai` bills the OpenAI API key; `openai-codex` uses the subscription sign-in.
- Read the first line of the file, as for a lens, and write the verdict to
  `job.json`.
- If `pi` exits with an error, or the first line isn't a verdict: replace the
  file with a stub that quotes what `pi` printed, set `second` to `SKIPPED`,
  write `decision.md` yourself, reading `ESCALATE`, then a blank line, then
  `The second-model review did not run: <what pi printed>.`, and go to
  **Needs human**. The user fixes `pi` and runs
  `/factory rework <job-id> rerun the reviews`, or lands without it with
  `/factory approve <job-id>`.

### Retro

Set `stage: "approve"`. Spawn `lif-workflow:factory-retro` with the prompt
`<paths> Final round: N.` Wait for it to finish, then check that `retro.md`
exists. If it does not, stop and tell the user. Then go to **Approve**.

### Approve

Spawn `lif-workflow:factory-approver` with the prompt `<paths> Final round: N.`
When it finishes, read the first line of `decision.md`:

- `APPROVE`: go to **Land**.
- `ESCALATE`: go to **Needs human**.

### Land

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

### Cleanup

After a merge, by PR or locally:

```bash
git -C <repo> worktree remove <worktree>
git -C <repo> branch -d factory/<job-id>
```

Set `stage: "merged"`. The plugin's safety hook asks the user before any branch
delete; that prompt is expected, not a failure. After a squash-merged PR,
`branch -d` can refuse because the commits differ. `gh pr view` printing
`MERGED` is the proof it landed, so use `-D` then. If removing the worktree
fails, the job is still merged: tell the user what `git worktree remove`
printed.

### Needs human

Set `stage: "needs-human"`. The branch and its worktree stay for the human to
inspect. Tell the user which job is waiting, give the worktree path, and quote
`decision.md` (or the BLOCKED reason from `build.md`).

## /factory next

Read `<factory>/backlog.md` and take the first `- [ ]` item. Claim it with one
Edit that replaces its exact line with `- [x] <item> → claimed`. If the Edit
fails because the line changed, another session claimed it: re-read the backlog
and try the next `- [ ]` item. If none is left, say so and stop.

Run `/factory <item>`, and once step 1 has given it a job id, replace `claimed`
on its backlog line with the job id.

## /factory approve <job-id>

The job must be in `needs-human` or `pr-open`.

- `needs-human`: run **Land** with that job id. Typing this command is the
  user's yes to push that one job, so do not ask the `Land` question again. A
  `Land: merge` project still lands by local merge.
- `pr-open`: run
  `cd <worktree> && gh pr view factory/<job-id> --json number,state`.
  `MERGED`: go to **Cleanup**. `OPEN`: run `pr-shepherd` again with that PR
  number. `CLOSED`: go to **Needs human**.

## /factory rework <job-id> <note>

The job must be in `needs-human`.

1. Write the note, verbatim, to `<factory>/jobs/<job-id>/rework-<k>.md`, where
   `k` is the next unused number.
2. Set `stage: "build"`.
3. Spawn a fresh `lif-workflow:factory-builder`, named `builder-<job-id>` where
   the `Agent` tool takes a name, with the prompt
   `<paths> Rework: read rework-<k>.md and address it, then update build.md for round N+1. Port: <port>.`
   (`N` is the job's last round.) A rework run gets a fresh `MAX_RESUMES`, and
   its first review round runs the full set of lenses.
4. Continue from **Build check**, exactly like a new job.

## Reporting

Keep the user posted with one short line per transition, for example
`003-rate-limiting: round 2, security CHANGES, ux/ui/code PASS → resuming builder`.
When the job ends, say whether it merged, waits as an open PR, or needs a human,
and why.
