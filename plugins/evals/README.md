# Eval-Driven Skill Testing

Behavioral eval framework for verifying skills produce correct first-response
behaviors when loaded as system prompts.

## Running Evals

```bash
# Quick: structural tests only (zero API calls for migrated tests,
# 1 API call per behavioral test)
pytest evals/

# Full: structural + LLM-as-judge (2 API calls per behavioral test)
pytest evals/ --full

# Single skill
pytest evals/skills/skill-designer/ -v

# Single scenario
pytest evals/skills/skill-designer/test_skill_designer.py::test_create_runs_interview_before_drafting -v
```

## Adding a New Eval

1. Add a `behaviors.md` to `evals/skills/<skill-name>/`
2. Write scenario `.md` files in `evals/skills/<skill-name>/scenarios/`
3. Write test file at `evals/skills/<skill-name>/test_<skill>.py`
4. Scenario frontmatter fields: `id`, `title`, `skill`, `behavior`, `pass_criteria`, `fail_criteria`

See `2026-03-21-eval-driven-skill-testing-design.md` (removed; see git history) for full spec.
