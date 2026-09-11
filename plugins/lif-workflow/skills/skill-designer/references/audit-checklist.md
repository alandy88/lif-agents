# Audit Checklist

## Severity Rubric
- `blocking`: the skill is incomplete, misleading, or unsafe to rely on for its intended job.
- `major`: the skill will likely trigger incorrectly, guide the agent poorly, or cause repeated workflow mistakes.
- `minor`: the skill is usable but has structural friction, weak packaging choices, or avoidable ambiguity.
- `advisory`: the skill is acceptable and the note is optional polish or clarity improvement.

## Frontmatter
- `name` and `description` required; optional: `license`, `allowed-tools`, `argument-hint`, `model`, `metadata`, `compatibility`
- trigger phrases are specific
- description explains both what the skill does and when it should trigger

## Body Quality
- imperative tone
- concise workflow
- no bloated inline detail
- sections are easy to scan and map to action

## Progressive Disclosure
- references are used for load-on-demand detail
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
