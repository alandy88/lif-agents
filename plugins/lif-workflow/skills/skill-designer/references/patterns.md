# Pattern Guide

## Tool Wrapper
- Problem it solves: package procedural guidance around a tool, domain, or repo convention so the agent stops rediscovering the same rules.
- Typical files used: a lean `SKILL.md`, optional `references/` for detail, optional `scripts/` only when the tool flow must be deterministic.
- Failure modes: frontmatter is too vague to trigger reliably, `SKILL.md` repeats reference content, or the skill explains the tool without telling the agent what to do.

## Generator
- Problem it solves: produce repeatable outputs with a stable structure instead of freehanding each result from scratch.
- Typical files used: `assets/` templates, optional `references/` for content rules, and a concise `SKILL.md` that says when to apply the template.
- Failure modes: template exists without output rules, asset shape is not reusable, or the generator overcommits to one format when the task is still open-ended.

## Reviewer
- Problem it solves: evaluate a target artifact against a standard and report concrete findings, risks, and improvements.
- Typical files used: `references/` checklists or rubrics, optional output templates in `assets/`, and instructions that force inspection of the real artifact.
- Failure modes: judging from summaries instead of source files, mixing workflow steps with the rubric, or reporting opinions without severity or evidence.

## Inversion
- Problem it solves: force the agent to gather requirements first so it does not invent constraints, outputs, or workflows.
- Typical files used: `SKILL.md` interview steps, optional `references/` for question frameworks, usually no assets or scripts.
- Failure modes: drafting too early, asking broad unfocused questions, or failing to stop when required decisions remain unresolved.

## Pipeline
- Problem it solves: enforce ordered gated steps when outcome quality depends on sequence rather than a single instruction.
- Typical files used: `SKILL.md` workflow steps, optional `references/` for gate criteria, and optional `assets/` for outputs at one or more stages.
- Failure modes: missing gates, unclear handoffs between steps, or bloating the pipeline with work that should stay discretionary.

## Composition Rules
- Pipeline can include Reviewer when the workflow must end with a formal check before completion.
- Generator can depend on Inversion when output shape is stable but requirements still need to be interviewed first.
- Tool Wrapper guidance can support any other pattern when the agent needs durable conventions without expanding `SKILL.md`.
