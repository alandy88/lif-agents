# Repo Conventions

## Frontmatter
- Write concise descriptions with trigger phrases that tell the agent both what the skill does and when to use it.
- `name` and `description` are required. Optional fields: `license`, `allowed-tools`, `argument-hint`, `model`, `metadata`, `compatibility`.

## SKILL.md Body
- Prefer lean `SKILL.md` bodies that stay procedural, scannable, and easy to load.
- Put core workflow, gates, and resource selection rules in `SKILL.md`; move durable detail to references for detailed guidance.
- Use imperative instructions instead of explanatory essays.

## Resource Choices
- Add assets only when reusable output structure exists.
- Add scripts only when deterministic execution is worth the maintenance cost.
- Prefer references when the information is durable, reusable, and not needed on every trigger.
- Skip resource directories that do not clearly earn their keep.

## Packaging
- Keep the skill folder minimal: no extra documentation clutter such as `README.md`, `CHANGELOG.md`, or process notes.
- Avoid hardcoded repo-specific script paths in examples unless the path is the actual interface the skill must use.
- Keep examples generic enough to survive reuse across worktrees and environments.
