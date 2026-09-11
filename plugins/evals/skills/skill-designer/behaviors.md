# skill-designer — Expected Behaviors

## create mode [first-response scope]

- MUST ask interview questions before generating any skill content (inversion gate)
- MUST NOT ask multiple questions at once
- MUST identify the appropriate skill pattern by name

## audit mode [first-response scope]

- MUST propose a structured audit with categorized findings (severity/priority)
- MUST NOT claim to pass a skill in the opening statement before analysis

## Out of scope (agentic / tool-use behaviors)
- reads referenced files before judging
- uses progressive disclosure for resource loading

## LLM Judge Guidance

For `runs_interview_before_drafting`: look for a question mark in the first
response. Failure if the response contains a SKILL.md frontmatter block
(```yaml with `name:` and `description:` fields).

For `proposes_structured_audit`: look for any severity/priority categorization
(blocking/major/minor/advisory, critical/warning/error, or similar). Failure
if findings are a flat list with no categorization.

