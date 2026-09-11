from __future__ import annotations

from pathlib import Path

from evals.helpers import parse_frontmatter

SCENARIOS = Path(__file__).parent / "scenarios"


def test_recursive_folder_selects_recursive(run_scenario, judge):
    scenario = SCENARIOS / "clean-recursive-folder.md"
    text = scenario.read_text(encoding="utf-8")
    meta = parse_frontmatter(text)
    output = run_scenario(scenario)

    output_lower = output.lower()
    assert "recursive" in output_lower, "expected recursive mode selection"

    verdict = judge(output, meta["pass_criteria"], meta["fail_criteria"])
    assert verdict.passed, verdict.reason


def test_single_folder_selects_single(run_scenario, judge):
    scenario = SCENARIOS / "clean-single-file-near-miss.md"
    text = scenario.read_text(encoding="utf-8")
    meta = parse_frontmatter(text)
    output = run_scenario(scenario)

    output_lower = output.lower()
    assert (
        "--mode recursive" not in output_lower
    ), "should not use recursive mode for a flat folder"

    verdict = judge(output, meta["pass_criteria"], meta["fail_criteria"])
    assert verdict.passed, verdict.reason
