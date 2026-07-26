# TASK

Independently verify the task "{{TASK_LABEL}}" just delivered on branch `{{BRANCH}}`.

You have a fresh context. Do not trust the previous session's claims — re-derive everything from the repo.

# PROCESS

1. Read `AGENTS.md`, `PLAN.md`, and the top entry of `STATE.md`.
2. Run `{{VERIFY}}`, plus the checks relevant to the diff — all must be green:

{{CONVENTIONS}}

3. Review the change: `git log main..HEAD --oneline` and `git diff main..HEAD --stat`, then
   the diffs that matter. Check against:
   - The task's scope in `PLAN.md` — nothing missing, nothing out of scope.
   - The conventions documented in `AGENTS.md`. Spot-check a few of the previous session's
     claims against the repo's own documentation; an invented ruling with nothing behind it
     is a verification failure.
4. Check the definition of done: `STATE.md` has a new top entry with a next-task
   recommendation, and nothing is left uncommitted.

# OUTCOME

- Small mechanical issues (missing `STATE.md` bookkeeping, a stray uncommitted file, a
  trivially wrong test): fix them on the branch and commit.
- If the checks fail and the fix isn't trivial, the diff violates the task's scope or the
  documented conventions, or a ruling was invented: do NOT patch over it. Output
  `<promise>VERIFY-FAILED</promise>` on its own line with a short reason above it, and stop.

If verification passes (after any fixes you committed), output `<promise>COMPLETE</promise>` on its own line.
