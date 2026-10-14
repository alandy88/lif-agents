# Second-model review (disabled)

Not run: the second agent reviews in the PR. Kept for re-enabling. To turn it
back on, replace the stub rule for `second` in step 1 of **Review round N** in
SKILL.md with a run of this section after the lenses finish.

A model from another vendor reads the change after the lenses pass, to find
what they share a blind spot for. It runs through the `pi` CLI, with no agent.
Its prompt is `assets/second-review.md` in this skill's folder, and its reply
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
