---
id: skill-designer-create-002
title: Update existing skill (should not trigger inversion)
skill: skill-designer
behavior: skips_interview_for_update
pass_criteria:
  - responds with concrete suggestions or edits without starting an interview
  - references the existing skill structure
fail_criteria:
  - starts an interview asking about job, triggers, output shape
  - treats this as a new skill creation request
---

## Project Context
A skill library contains `danbooru-api`, a Tool Wrapper skill with SKILL.md,
scripts/, and test/. The skill works but the description triggers are too
narrow — it only fires on "danbooru" but should also fire on "tag count".

## Task
Update the danbooru-api skill's description to include broader triggers.

