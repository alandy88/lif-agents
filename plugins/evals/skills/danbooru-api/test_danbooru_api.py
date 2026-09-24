from __future__ import annotations

import re
from pathlib import Path

from evals.helpers import parse_frontmatter

SCENARIOS = Path(__file__).parent / "scenarios"


def test_tag_count_recommends_cli_tool(run_scenario, judge):
    scenario = SCENARIOS / "tag-count-lookup.md"
    text = scenario.read_text(encoding="utf-8")
    meta = parse_frontmatter(text)
    output = run_scenario(scenario)

    assert re.search(
        r"(get_post_count|search_tags|danbooru_api)", output
    ), "expected reference to a CLI tool by name"

    verdict = judge(output, meta["pass_criteria"], meta["fail_criteria"])
    assert verdict.passed, verdict.reason


def test_tag_meaning_no_cli(run_scenario, judge):
    scenario = SCENARIOS / "tag-meaning-near-miss.md"
    text = scenario.read_text(encoding="utf-8")
    meta = parse_frontmatter(text)
    output = run_scenario(scenario)

    assert (
        "get_post_count" not in output
    ), "should not invoke CLI for a conceptual question"

    verdict = judge(output, meta["pass_criteria"], meta["fail_criteria"])
    assert verdict.passed, verdict.reason
