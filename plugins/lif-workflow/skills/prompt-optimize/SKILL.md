---
name: prompt-optimize
description: "Rewrite a raw prompt into a task brief tuned for Claude Opus 5.5. Use when the user's request is a multi-step agentic task (a feature, refactor, migration, audit, multi-file bug, or research across several sources), when asked to rewrite or optimize a prompt, or before writing a brief for a subagent, Codex, or a handoff. Skip questions, single edits, and prompts that are already a structured brief."
argument-hint: "[raw prompt]"
---

# prompt-optimize

Turn a raw prompt into a **brief**: the same request, with the gaps a capable newcomer
would trip on filled from the repo and the conversation. The brief never changes what was
asked. It makes the goal, scope, and finish line explicit, and strips the phrasing that
misfires on Opus 5.5.

## Pick the branch

- **Run** — the user gave a raw prompt for work that will take several tool calls across
  files or systems. Rewrite it, then do the work against the brief.
- **Rewrite only** — the user asked to rewrite or optimize a prompt, or passed one as the
  argument. Return the brief and stop; do not execute it.
- **Delegate** — you are about to hand work to a subagent, Codex, or a handoff note. The
  receiver starts with no context, so the brief carries everything it needs.

Skip the skill when the prompt already has a goal, scope, and a checkable finish line,
such as `plan-handoff` output or an issue spec.

## Steps

1. **Read the raw prompt for intent.** Name the goal and the reason behind it. If the user
   pasted third-party text, keep it quoted as data, separate from their own words.
2. **Fill the gaps by looking.** Resolve file paths, commands, test names, and conventions
   from the repo, its `AGENTS.md`, and the conversation. Ask the user only when two readings
   would lead to materially different work; ask once, with a recommended reading.
3. **Write the brief** with the sections and rules in
   [references/rewrite-rules.md](references/rewrite-rules.md): apply every "Strip" rule to
   the raw text, fill every section, and add each conditional block whose condition holds.
4. **Hand it off by branch.**
   - Run: when a more specific skill covers the work, such as `issue-implement` or
     `ui-hig`, invoke it with the brief as its input. Otherwise record the brief as the
     task list, one item per deliverable, each worded as its done-when, and work the list
     to the end. Put goal and scope in the first item, with any reading you chose where the
     raw prompt was open, so the user can redirect you.
   - Rewrite only: return the brief in one fenced block, then one line per material change
     made and why. Nothing else.
   - Delegate: pass the brief as the prompt. Include what you already learned and ruled
     out, so the receiver does not repeat it.

Done when every section in the rules file is filled or deliberately empty, no "Strip"
pattern remains, and the brief asks for exactly what the raw prompt asked for.
