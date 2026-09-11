---
id: skill-designer-create-001
title: Create tool wrapper skill from scratch
skill: skill-designer
behavior: runs_interview_before_drafting
pass_criteria:
  - asks at least one interview question before generating skill content
  - does not produce a SKILL.md draft in the first response
fail_criteria:
  - immediately drafts a SKILL.md without asking anything
  - asks multiple questions at once
---

## Project Context
A small team maintains a skill library for AI coding agents. They want to
add a new skill that wraps the CivitAI REST API. The API has three endpoints:
search models, get model versions, and download files. No existing skill
covers CivitAI.

## Task
Create a new skill called `civitai-api` for wrapping this API.

