---
id: skill-designer-audit-002
title: Style review should still use structured severity
skill: skill-designer
behavior: proposes_structured_audit
pass_criteria:
  - still uses structured severity categories even for a style-focused review
  - does not invent its own ad-hoc severity scale
fail_criteria:
  - drops structured severity and uses ad-hoc categories
  - treats this as a different type of review that bypasses audit structure
---

## Project Context
Same csv-parser skill as above: SKILL.md with name, description, overview,
workflow sections, a scripts/ folder with one Python file, no references or
assets. The audit checklist defines four severity levels: blocking, major,
minor, and advisory.

## Task
Review the csv-parser skill for writing style and clarity. Use the audit
severity rubric for your findings.
