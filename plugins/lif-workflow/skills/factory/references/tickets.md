# Building a split job

This replaces step 4, **Build**, of `/factory <feature>` when the spec writer
left two or more files in `<factory>/jobs/<job-id>/tickets/`. One builder builds
each ticket in its own worktree, you merge each one into the job branch, and a
last builder checks the whole job. From **Build check** on, the job runs as
SKILL.md says.

The tickets are a graph, not a list. Each names the tickets that block it. The
**frontier** is every ticket not yet started whose blockers have all merged.

## State

`job.json` gains a `tickets` map for the length of the job, one entry per
ticket file: `"tickets": { "01": "merged", "02": "building", "03": "pending" }`.
Each value is `pending`, `building` or `merged`.

Ticket `<NN>` has its own worktree, `<factory>/worktrees/<job-id>-<NN>`, on its
own branch, `factory/<job-id>-<NN>`, cut from the job branch. Nobody works in
the job's own worktree until **Integrate**, so you can merge there.

## The loop

1. **Read the graph.** Read the `Blocked by` line of every ticket file. Set
   `stage: "build"` and every ticket to `pending`.
2. **Start the frontier.** For each ticket on it, create the worktree and run
   the setup AGENTS.md gives for a fresh checkout:
   ```bash
   git -C <repo> worktree add -b factory/<job-id>-<NN> <factory>/worktrees/<job-id>-<NN> factory/<job-id>
   ```
   Set those tickets to `building`. Spawn one `lif-workflow:factory-builder` per
   ticket, all in one message so they run in parallel, each with the prompt
   `Job folder: <factory>/jobs/<job-id>/. Worktree: <factory>/worktrees/<job-id>-<NN>. Branch: factory/<job-id>-<NN>. Base: factory/<job-id>. Ticket <NN>.`
   Where the `Agent` tool takes a name, name it `builder-<job-id>-<NN>`. A
   ticket builder gets no port.
3. **Each time a builder finishes**, read the first line of
   `<factory>/jobs/<job-id>/ticket-reports/<NN>.md`.
   - `STATUS: BLOCKED`, or no such file: start nothing new, wait for the
     builders still running, merge the ones that come back `READY`, then go to
     **Needs human** and quote the reason.
   - `STATUS: READY`: merge the ticket, one merge at a time:
     ```bash
     git -C <worktree> merge --no-ff factory/<job-id>-<NN> -m "Merge ticket <NN>"
     ```
     If it conflicts, run `git -C <worktree> merge --abort` and send that
     ticket's builder
     `Job branch moved: factory/<job-id> no longer merges with your branch.`
     Where this session has `SendMessage`, resume the same builder with it.
     Where it has none, spawn a fresh one with the ticket prompt from step 2,
     then that message, then
     `Read spec.md, your ticket file and ticket-reports/<NN>.md first.`
     It does not count against `MAX_RESUMES`. When it finishes, merge again. A second conflict on the same ticket goes to **Needs human**.
   - After the merge, set the ticket to `merged` and remove its worktree with
     `git -C <repo> worktree remove <factory>/worktrees/<job-id>-<NN>`. Leave its
     branch for **Cleanup**.
4. **Move the frontier.** After each merge, work out the frontier again and go
   to step 2 for any ticket now on it. Do not wait for the other builders.
5. **Stuck.** When tickets are still `pending`, none is `building` and the
   frontier is empty, the `Blocked by` lines form a ring: go to **Needs human**.
6. **Integrate.** When every ticket is `merged`, spawn
   `lif-workflow:factory-builder` in the job's own worktree with the prompt
   `<paths> Build round 1. Integrate: the tickets in <factory>/jobs/<job-id>/tickets/ are merged. Port: <port>.`
   Where the `Agent` tool takes a name, name it `builder-<job-id>`. Wait for it
   to finish, then go to **Build check**. Every later resume, rework and base
   sync goes to this one builder, as for a job that was never split.

A ticket has no retries of its own. A merge that breaks the build shows up at
the **Checks gate** and counts against `MAX_RESUMES` there.

## Needs human

A ticket that never merged keeps its worktree and branch for the human to
inspect. Give those paths too.

## Cleanup

After the job's own worktree and branch are removed, for every ticket:

```bash
git -C <repo> worktree remove <factory>/worktrees/<job-id>-<NN>   # only if it is still there
git -C <repo> branch -d factory/<job-id>-<NN>
```

After a squash-merged PR, `branch -d` refuses here too: use `-D`, on the same
proof.
