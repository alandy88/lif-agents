@~/.agents/AGENTS.md

# Claude Code only

## Advisor

When the advisor tool is available, call it at these points:

- After you have a plan, before you implement it. Ask for an adversarial review: what breaks, what is missing, what is wrong.
- After you implement the task. Ask for a code review and an acceptance review: does the change meet what the user asked? Make the work durable first.
- After the same test, build, or type error fails twice. Ask whether the fix targets the root cause.

Skip it for routine reads, searches, and single-step edits.

## Subagent model

Before each Agent call, size the task and set `model` explicitly. This overrides the default to inherit the session model.

| Size | Model | Examples |
| --- | --- | --- |
| Lookup | `haiku` | Find files, grep, read docs, summarize a known file. No edits. |
| Defined work | `sonnet` | Edits with a clear spec, run tests, mechanical refactors. |
| Judgment | `opus` | Ambiguous scope, design, cross-module changes, hard debugging, review. |

Exception: when the agent type sets its own `model` in its agent file (for example `lif-workflow:builder`), omit `model` on the call, since a call's `model` beats the agent file's.

When unsure between two sizes, pick the larger. Forks ignore `model`; use a named agent type when the size calls for a smaller model.
