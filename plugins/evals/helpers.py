from __future__ import annotations

import re
from dataclasses import dataclass

import yaml

REQUIRED_FIELDS = {"id", "title", "skill", "behavior", "pass_criteria", "fail_criteria"}


def parse_frontmatter(text: str) -> dict:
    """Parse YAML frontmatter from a scenario file. Returns a dict."""
    match = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    if not match:
        raise ValueError("Scenario file must start with YAML frontmatter (---)")
    data = yaml.safe_load(match.group(1))
    missing = REQUIRED_FIELDS - set(data)
    if missing:
        raise ValueError(f"Scenario frontmatter missing required fields: {missing}")
    return data


def extract_body(text: str) -> str:
    """Strip YAML frontmatter, return the markdown body."""
    match = re.match(r"^---\n.*?\n---\n(.*)$", text, re.DOTALL)
    if not match:
        raise ValueError("Scenario file must start with YAML frontmatter (---)")
    return match.group(1).strip()


@dataclass
class JudgeVerdict:
    passed: bool
    reason: str


def parse_judge_verdict(raw: str) -> JudgeVerdict:
    """Parse RESULT: PASS/FAIL and REASON: lines from judge output."""
    result_match = re.search(r"RESULT:\s*(PASS|FAIL)", raw, re.IGNORECASE)
    reason_match = re.search(r"REASON:\s*(.+)", raw, re.IGNORECASE)
    if not result_match:
        raise ValueError(f"Judge output missing RESULT: PASS/FAIL line. Got:\n{raw}")
    if not reason_match:
        raise ValueError(f"Judge output missing REASON: line. Got:\n{raw}")
    return JudgeVerdict(
        passed=result_match.group(1).upper() == "PASS",
        reason=reason_match.group(1).strip(),
    )


def build_judge_prompt(
    output: str,
    pass_criteria: list[str],
    fail_criteria: list[str],
) -> str:
    """Build the judge prompt that instructs Claude to evaluate an output."""
    pass_lines = "\n".join(f"  - {c}" for c in pass_criteria)
    fail_lines = "\n".join(f"  - {c}" for c in fail_criteria)
    return f"""\
You are an eval judge. Evaluate whether the following assistant output \
meets the pass criteria and avoids the fail criteria.

## Assistant Output
{output}

## Pass Criteria (all must be met)
{pass_lines}

## Fail Criteria (any triggers failure)
{fail_lines}

## Instructions
Respond with EXACTLY two lines, nothing else:
RESULT: PASS
REASON: <one sentence>

or:
RESULT: FAIL
REASON: <one sentence>
"""
