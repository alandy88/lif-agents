---
name: skill-designer
disable-model-invocation: true
description: "Use when designing a new agent skill, auditing an existing SKILL.md, or improving skill packaging and trigger quality."
argument-hint: "[create|audit|redesign] [skill-name]"
allowed-tools: Read, Write, Edit, Glob, Grep
---

# skill-designer

## Overview

Design or audit a skill by choosing the right mode first, then apply the smallest pattern mix and resource set that solves the job. Keep `SKILL.md` lean, put durable detail in reusable references, and use assets only when the output shape will recur.

## Decide the Mode

- Use create mode for a new skill.
- Use redesign mode when an existing skill needs major structural changes but still requires requirement discovery before drafting.
- Use audit mode when the user wants critique, findings, or a refactor recommendation on an existing skill.
- In create or redesign mode, confirm the skill's job, trigger requests, output shape, and whether `references/`, `assets/`, or `scripts/` are justified before drafting.
- In audit mode, inspect the real skill files before judging them.

## Create Workflow

1. Interview for the skill's job, likely user requests, expected outputs, and reusable resource needs.
2. Classify the smallest viable pattern mix that covers the work.
3. Decide whether `references/`, `assets/`, and `scripts/` are justified.
4. Initialize the skill directory: `scripts/init_skill.py <skill-name> --path <output-directory>`.
5. Draft the file layout and skill contents in repository-ready form.
6. Audit the draft against the checklist before presenting it as complete.
7. Package the skill: `scripts/package_skill.py <path/to/skill-folder> [output-dir]`. Validates frontmatter format and required fields before creating a distributable `.skill` file.

Do not draft the skill until the interview phase is complete.
If information is insufficient, stop short of drafting full files and return missing decisions, assumptions, and a partial design outline only.
Do not mark the skill complete until it passes the audit checklist.

## Audit Workflow

1. Read the target `SKILL.md` and inspect the skill directory.
2. Read material referenced files before judging progressive disclosure, resource choices, or packaging readiness.
3. Identify the current pattern mix and whether it matches the job.
4. Evaluate the skill against the audit checklist.
5. Report severity-based findings plus the smallest structural improvements that materially help.

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

- Open `references/patterns.md` when choosing or defending a pattern mix.
- Open `references/pattern-selection.md` when the right pattern mix is unclear.
- Open `references/audit-checklist.md` before closing create work or when running an audit.
- Open `references/repo-conventions.md` when drafting frontmatter, packaging, or resource layout.
- Open `references/output-patterns.md` when the skill needs consistent output formats (templates or examples).
- Open `references/workflows.md` when designing sequential or conditional step flows.
- Open `assets/skill-template.md` when drafting a new `SKILL.md`.
- Open `assets/reference-template.md` when adding a reusable reference file.
- Open `assets/audit-report-template.md` when you need a consistent audit output shape.

## Scripts

- `scripts/init_skill.py <name> --path <dir>` — scaffold a new skill directory with SKILL.md template and example resource dirs.
- `scripts/package_skill.py <skill-dir> [output-dir]` — validate and package a skill into a distributable `.skill` file.
- `scripts/quick_validate.py` — lightweight validation of frontmatter format, required fields, naming conventions, and allowed properties.
