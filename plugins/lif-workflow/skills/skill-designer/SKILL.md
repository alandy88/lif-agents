---
name: skill-designer
disable-model-invocation: true
description: "Designs new agent skills and audits existing ones against Anthropic's skill-authoring rules (frontmatter limits, description shape, size, one-level references, bundled scripts), choosing among five patterns: Tool Wrapper, Generator, Reviewer, Inversion, Pipeline. Use when designing a new skill, reviewing a skill or its SKILL.md, or improving a skill's packaging or trigger quality."
argument-hint: "[create|audit|redesign] [skill-name]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(uv run *)
---

# skill-designer

## Overview

Design or audit a skill by choosing the mode first, then the smallest pattern mix and resource set that does the job. The rules come from Anthropic's "Skill authoring best practices" (https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices); [references/repo-conventions.md](references/repo-conventions.md) holds the ones this repo applies. Fetch the page when a rule is unclear rather than restating it in a skill.

## Decide the Mode

- Use create mode for a new skill.
- Use redesign mode when an existing skill needs major structural changes but still requires requirement discovery before drafting.
- Use audit mode when the user wants critique, findings, or a refactor recommendation on an existing skill.
- In create or redesign mode, confirm the skill's job, trigger requests, output shape, and whether `references/`, `assets/`, or `scripts/` are justified before drafting. Ask one question at a time.
- In audit mode, inspect the real skill files before judging them.

## Create Workflow

1. Interview for the skill's job, likely user requests, expected outputs, and reusable resource needs.
2. Classify the smallest viable pattern mix that covers the work.
3. Decide whether `references/`, `assets/`, and `scripts/` are justified.
4. Create the skill folder, named after the skill, and draft `SKILL.md` from [assets/skill-template.md](assets/skill-template.md). Create a resource folder only when it gets a file.
5. Draft the remaining files in repository-ready form.
6. Run the validator and audit the draft against the checklist before presenting it as complete. Fix and repeat until both pass.
7. Package the skill only when the user wants a `.skill` file to upload.

Do not draft the skill until the interview phase is complete.
If information is insufficient, stop short of drafting full files and return missing decisions, assumptions, and a partial design outline only.
Do not mark the skill complete until it passes the audit checklist.

## Audit Workflow

1. Read the target `SKILL.md` and inspect the skill directory.
2. Run the validator on it.
3. Read material referenced files before judging progressive disclosure, resource choices, or packaging readiness.
4. Identify the current pattern mix and whether it matches the job.
5. Evaluate the skill against the audit checklist. Check every path, command and flag the skill names against the repo.
6. Report severity-based findings plus the smallest structural improvements that materially help.

If `SKILL.md`, the skill directory, or a material referenced file is missing, report what is missing, what judgment that blocks, and whether the result is a blocked audit or a partial audit.

## Pattern Selection Rules

- Use Tool Wrapper when the skill mainly teaches conventions, repo rules, or domain procedure.
- Use Generator when the skill should produce templated output with a repeatable shape.
- Use Reviewer when the skill must evaluate work against a standard and report findings.
- Use Inversion when the skill must interview first instead of drafting from assumptions.
- Use Pipeline when correctness depends on ordered gated steps.
- Prefer the smallest viable pattern mix that fully covers the job.

## Resource Selection Rules

- Use `references/` for durable guidance that another agent should load on demand instead of carrying inline in `SKILL.md`.
- Use `assets/` when the same output structure will recur and a reusable template reduces drift.
- Do not recommend scripts unless the task needs deterministic execution.
- Skip empty resource categories; do not add files that do not clearly earn their maintenance cost.

## Output Expectations

- For create or redesign work, return the selected mode, pattern mix, resource plan, drafted files, and any remaining assumptions or risks.
- For audits, report findings with `blocking`, `major`, `minor`, or `advisory` severity and explain each recommendation concretely.
- Group audit actions under required fixes, strong recommendations, and optional polish.
- Distinguish clearly between a complete audit, a partial audit, and a blocked audit.

## Reference Map

- Open [references/repo-conventions.md](references/repo-conventions.md) when drafting frontmatter, packaging, or resource layout.
- Open [references/audit-checklist.md](references/audit-checklist.md) before closing create work or when running an audit.
- Open [references/patterns.md](references/patterns.md) when choosing or defending a pattern mix.
- Open [references/pattern-selection.md](references/pattern-selection.md) when the right pattern mix is unclear.
- Open [assets/skill-template.md](assets/skill-template.md) when drafting a new `SKILL.md`.
- Open [assets/reference-template.md](assets/reference-template.md) when adding a reusable reference file.
- Open [assets/audit-report-template.md](assets/audit-report-template.md) when you need a consistent audit output shape.

## Scripts

Both need Python 3 and PyYAML; run them through `uv`, which supplies PyYAML, from any folder:

```bash
# Validate frontmatter: name rules, reserved words, description length and angle brackets, allowed keys
uv run --no-project --with pyyaml python <this skill's folder>/scripts/quick_validate.py <skill-dir>

# Validate, then zip the skill into <skill-name>.skill in output-dir (default: the current folder)
uv run --no-project --with pyyaml python <this skill's folder>/scripts/package_skill.py <skill-dir> [output-dir]
```

`quick_validate.py` prints `Skill is valid!` and exits 0, or prints the first problem and exits 1.
