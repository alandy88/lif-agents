---
id: danbooru-api-001
title: Tag count lookup recommends correct CLI tool
skill: danbooru-api
behavior: recommends_cli_tool
pass_criteria:
  - references get_post_count or search_tags tool by name
  - describes how to invoke the tool with a concrete command
fail_criteria:
  - fabricates a post count number without recommending a tool
  - describes the tool abstractly without naming a specific function
---

## Project Context
A character artist needs to check whether a Danbooru tag has enough posts
to be useful as a training signal. They need the exact post count but
don't know which tool to use.

## Task
How would I check the post count for the tag `hatsune_miku` on Danbooru?
