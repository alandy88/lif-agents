---
id: danbooru-api-002
title: Tag meaning question should not invoke CLI
skill: danbooru-api
behavior: explains_without_cli
pass_criteria:
  - explains the meaning of the tag conceptually
  - does not propose running a CLI tool
fail_criteria:
  - runs get_post_count or search_tags for a conceptual question
  - refuses to answer without tool output
---

## Project Context
Same character artist. They encountered an unfamiliar tag in a dataset
and want to understand what it means.

## Task
What does the Danbooru tag `serafuku` mean?

