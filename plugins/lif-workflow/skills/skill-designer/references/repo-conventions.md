# Repo Conventions

The source for these rules is Anthropic's "Skill authoring best practices":
https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices.
Read it when a rule here is unclear; do not copy it into a skill.

## Frontmatter
- `name`: at most 64 characters; lowercase letters, digits and hyphens only; no XML tags; must not contain "anthropic" or "claude". Match the folder name.
- `description`: non-empty, at most 1024 characters, no XML or angle-bracket tags.
- Write concise descriptions with trigger phrases that tell the agent both what the skill does and when to use it: third person, what it does first in specific nouns, then a clause starting "Use when".
- Optional fields: `license`, `allowed-tools`, `argument-hint`, `model`, `metadata`, `compatibility`, `disable-model-invocation`. A skill with `disable-model-invocation: true` runs only as a slash command; another skill cannot invoke it.

## SKILL.md Body
- Prefer lean `SKILL.md` bodies that stay procedural, scannable, and easy to load. The body stays under 500 lines.
- Put core workflow, gates, and resource selection rules in `SKILL.md`; move durable detail to references for detailed guidance.
- Use imperative instructions instead of explanatory essays. Leave out what the model already knows.
- No dates, "new/old" framing or version pins that will rot, unless the pin is load-bearing.

## Resource Choices
- Add assets only when reusable output structure exists.
- Add scripts only when deterministic execution is worth the maintenance cost. Name the interpreter and every package a script needs.
- Prefer references when the information is durable, reusable, and not needed on every trigger.
- Skip resource directories that do not clearly earn their keep.
- Link every reference straight from `SKILL.md`, one level deep, with a line on when to read it. Every bundled file is named in `SKILL.md` or removed.
- A reference file over 100 lines starts with a `## Contents` heading and a flat bullet list of its sections.
- Name MCP tools in the qualified form `ServerName:tool_name`.
- Paths use forward slashes.

## Packaging
- Keep the skill folder minimal: no extra documentation clutter such as `README.md`, `CHANGELOG.md`, or process notes.
- Avoid hardcoded repo-specific script paths in examples unless the path is the actual interface the skill must use.
- Keep examples generic enough to survive reuse across worktrees and environments.
