---
name: cc-reviewer
disable-model-invocation: true
description: "Runs a one-shot, read-only Claude Code CLI review (`claude -p` in plan mode) of a diff, files, a feature, an architecture or a design doc, then triages the findings before reporting them. Use when the user wants a second Claude Code session to review code, architecture or a spec without editing anything."
argument-hint: "[review-scope or target]"
allowed-tools: Bash(claude *)
---

# cc-reviewer

Use a separate `claude -p` session as a reviewer, never as an editor. For flag
syntax, run `claude --help`; do not rely on memory, flags change between
releases.

Other review routes: `issue-review` refines a branch in this session, and the
`codex` skill's review mode asks Codex instead of Claude.

## Steps

1. Pick the target and lens from the argument: a diff, named files, a feature,
   an architecture, or a design doc; and correctness, regressions, security,
   tests, or trade-offs.
2. Run from the repo root or the smallest folder that holds the target, with
   `--permission-mode plan` so the session cannot edit. Use `--model opus` for
   architecture and design reviews, `--model sonnet` for the rest. Example:

   ```bash
   claude -p --permission-mode plan --model sonnet \
     --append-system-prompt "Findings first, by severity. Cite file and line for each." \
     "Review the diff of this branch against main for correctness, regressions and missing tests."
   ```

   The prompt names the target, the lens, the output shape (findings, then
   open questions, then recommendations), and that each finding must cite a
   file, function or concrete failure. Use `--append-system-prompt` to add a
   rubric; do not replace the system prompt. Add `--output-format json` only
   when a tool reads the result, and name the keys in the prompt.
3. Follow up with `claude -c -p "..."` in the same folder to narrow the same
   review. Start a new run when the target or the lens changes.
4. Triage before you report. Open each cited file and confirm the finding;
   drop the ones that do not hold, and say how many you dropped. Report what
   is left by severity, with the evidence.
