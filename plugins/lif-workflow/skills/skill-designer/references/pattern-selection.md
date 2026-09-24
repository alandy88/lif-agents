# Pattern Selection

## Decision Prompts
- If the skill teaches conventions, default to Tool Wrapper.
- If the skill produces templated output, add Generator.
- If the skill evaluates against a standard, add Reviewer.
- If the skill must interview first, add Inversion.
- If the skill has ordered gated steps, add Pipeline.

## Yes Or No Pass
1. Does the skill primarily teach conventions, repo rules, or domain procedure another agent should follow?
2. Does the skill need to produce templated output that should look similar across repeated uses?
3. Does the skill need to evaluate work against a checklist, rubric, or acceptance standard?
4. Does the agent need to ask focused questions before it can safely draft or restructure anything?
5. Does the workflow have ordered gates where later steps are invalid until earlier steps complete?

## Selection Rules
- Start with the one pattern that solves the core job.
- Add a second or third pattern only when the job clearly requires it.
- Prefer Tool Wrapper for reusable conventions and references.
- Prefer Generator only when the output shape will recur enough to justify assets.
- Prefer Reviewer when acceptance depends on explicit findings, evidence, or severity.
- Prefer Inversion when missing requirements would force guesswork.
- Prefer Pipeline when sequencing materially changes correctness, not just presentation.

## Final Rule
- Prefer the smallest viable pattern mix that fully covers the job without adding decorative structure.
