from pathlib import Path
import pytest

from evals.helpers import parse_frontmatter
from evals.helpers import extract_body

SAMPLE_SCENARIO = """\
---
id: test-001
title: Test scenario
skill: test-skill
behavior: test_behavior
pass_criteria:
  - does something good
  - avoids something bad
fail_criteria:
  - does something wrong
---

## Project Context
Some project context here.

## Task
Do the task.
"""


def test_parse_frontmatter_extracts_scalar_fields():
    meta = parse_frontmatter(SAMPLE_SCENARIO)
    assert meta["id"] == "test-001"
    assert meta["title"] == "Test scenario"
    assert meta["skill"] == "test-skill"
    assert meta["behavior"] == "test_behavior"


def test_parse_frontmatter_extracts_list_fields():
    meta = parse_frontmatter(SAMPLE_SCENARIO)
    assert meta["pass_criteria"] == ["does something good", "avoids something bad"]
    assert meta["fail_criteria"] == ["does something wrong"]


def test_parse_frontmatter_raises_on_missing_frontmatter():
    with pytest.raises(ValueError, match="must start with YAML frontmatter"):
        parse_frontmatter("# No frontmatter here")


def test_parse_frontmatter_raises_on_missing_required_field():
    incomplete = "---\nid: x\ntitle: x\n---\nBody"
    with pytest.raises(ValueError, match="skill"):
        parse_frontmatter(incomplete)


def test_extract_body_strips_frontmatter():
    body = extract_body(SAMPLE_SCENARIO)
    assert body.startswith("## Project Context")
    assert "---" not in body


def test_extract_body_preserves_content():
    body = extract_body(SAMPLE_SCENARIO)
    assert "Some project context here." in body
    assert "Do the task." in body


from evals.helpers import JudgeVerdict, parse_judge_verdict


def test_parse_judge_verdict_pass():
    raw = "RESULT: PASS\nREASON: The output asks a question before drafting."
    verdict = parse_judge_verdict(raw)
    assert verdict.passed is True
    assert verdict.reason == "The output asks a question before drafting."


def test_parse_judge_verdict_fail():
    raw = "RESULT: FAIL\nREASON: The output immediately produced a SKILL.md."
    verdict = parse_judge_verdict(raw)
    assert verdict.passed is False
    assert verdict.reason == "The output immediately produced a SKILL.md."


def test_parse_judge_verdict_raises_on_malformed():
    with pytest.raises(ValueError, match="RESULT"):
        parse_judge_verdict("Some freeform text without structure")


def test_parse_judge_verdict_handles_extra_whitespace():
    raw = "  RESULT:  PASS  \n  REASON:  It works.  "
    verdict = parse_judge_verdict(raw)
    assert verdict.passed is True
    assert verdict.reason == "It works."


from evals.helpers import build_judge_prompt


def test_build_judge_prompt_contains_output_and_criteria():
    prompt = build_judge_prompt(
        output="Here is the assistant output.",
        pass_criteria=["asks a question", "no code block"],
        fail_criteria=["drafts immediately"],
    )
    assert "Here is the assistant output." in prompt
    assert "asks a question" in prompt
    assert "no code block" in prompt
    assert "drafts immediately" in prompt
    assert "RESULT: PASS" in prompt  # instructs the format
    assert "RESULT: FAIL" in prompt


def test_build_judge_prompt_uses_required_format_instruction():
    prompt = build_judge_prompt("out", ["p"], ["f"])
    assert "REASON:" in prompt
