from __future__ import annotations

import re
from pathlib import Path

from evals.helpers import parse_frontmatter

SCENARIOS = Path(__file__).parent / "scenarios"


def test_describes_phash_approach(run_scenario, judge):
    scenario = SCENARIOS / "match-compressed-images.md"
    text = scenario.read_text(encoding="utf-8")
    meta = parse_frontmatter(text)
    output = run_scenario(scenario)

    output_lower = output.lower()
    assert any(
        t in output_lower for t in ["phash", "perceptual", "imagehash"]
    ), "expected reference to perceptual hashing approach"

    verdict = judge(output, meta["pass_criteria"], meta["fail_criteria"])
    assert verdict.passed, verdict.reason


def test_no_matches_handled_gracefully(run_scenario, judge):
    scenario = SCENARIOS / "match-no-results-near-miss.md"
    text = scenario.read_text(encoding="utf-8")
    meta = parse_frontmatter(text)
    output = run_scenario(scenario)

    output_lower = output.lower()
    assert any(
        t in output_lower for t in ["threshold", "adjust", "check", "mismatch"]
    ), "expected troubleshooting guidance"

    verdict = judge(output, meta["pass_criteria"], meta["fail_criteria"])
    assert verdict.passed, verdict.reason
