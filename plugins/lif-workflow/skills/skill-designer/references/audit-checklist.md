# Audit Checklist

## Severity Rubric
- `blocking`: the skill is incomplete, misleading, or unsafe to rely on for its intended job.
- `major`: the skill will likely trigger incorrectly, guide the agent poorly, or cause repeated workflow mistakes.
- `minor`: the skill is usable but has structural friction, weak packaging choices, or avoidable ambiguity.
- `advisory`: the skill is acceptable and the note is optional polish or clarity improvement.

## Hard Rules (a break is `blocking`)
- `scripts/quick_validate.py` passes: name format, length and reserved words; description present, at most 1024 characters, no angle brackets
- `SKILL.md` body is under 500 lines
- every file `SKILL.md` names exists, and every bundled file is named in `SKILL.md`
- every step can run: named tools, skills and commands exist, and no step invokes a skill that has `disable-model-invocation: true`

## Frontmatter
- `name` and `description` required; optional: `license`, `allowed-tools`, `argument-hint`, `model`, `metadata`, `compatibility`, `disable-model-invocation`
- trigger phrases are specific
- description explains both what the skill does and when it should trigger, in third person, ending with a "Use when" clause

## Body Quality
- imperative tone
- facts (paths, commands, flags, file names) match the code they describe
- no time-sensitive text, Windows backslash paths, or unqualified MCP tool names (use `ServerName:tool_name`)
- scripts name their interpreter and packages, handle their own errors, and justify their constants
- concise workflow
- no bloated inline detail
- sections are easy to scan and map to action

## Progressive Disclosure
- references are used for load-on-demand detail
- references are one level deep from `SKILL.md`
- a reference file over 100 lines opens with a `## Contents` list
- assets are justified
- scripts are justified
- detail does not duplicate what already lives in linked resources

## Pattern Fit
- identified pattern mix matches the job
- unnecessary patterns are rejected
- the smallest viable pattern mix is used

## Pipeline and Gates
- create path has interview gate
- audit path inspects real files
- completion claims require checklist pass

## Missing Files
- blocked vs partial audit behavior is explicit
- missing `SKILL.md` or core references do not get hand-waved away

## Recommendation Summary Buckets
- required fixes
- strong recommendations
- optional polish
