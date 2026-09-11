---
id: skill-designer-audit-001
title: Audit proposes structured approach
skill: skill-designer
behavior: proposes_structured_audit
pass_criteria:
  - proposes a structured audit with categorized findings
  - does not immediately claim the skill passes without inspection
fail_criteria:
  - produces a flat list of comments with no severity or priority structure
  - opens with "this skill passes" or equivalent before any analysis
---

## Project Context
A skill library has a skill called `csv-parser` with a SKILL.md containing
name, description, overview, and workflow sections. It has a scripts/ folder
with one Python file, and no references or assets. The skill-designer audit
checklist uses four severity levels: blocking, major, minor, and advisory.

## Task
Audit the csv-parser skill using the audit checklist. Categorize your
findings by severity.
