# danbooru-api — Expected Behaviors

## tag lookup [first-response scope]

- MUST reference the correct CLI tool by name (get_post_count, search_tags, etc.)
- MUST describe how to invoke the tool, not just mention it abstractly
- MUST NOT fabricate tag counts or post data without recommending tool use

## LLM Judge Guidance

For `recommends_cli_tool`: look for a specific function name (get_post_count,
search_tags, etc.) with invocation guidance. Failure if the response fabricates
data or only mentions "the API" without naming a tool.

