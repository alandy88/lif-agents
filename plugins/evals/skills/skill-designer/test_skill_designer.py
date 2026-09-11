from __future__ import annotations

from pathlib import Path
import re

REPO_ROOT = (
    Path(__file__).resolve().parents[3]
)  # evals/skills/skill-designer -> repo root
SKILL_DIR = REPO_ROOT / "skills" / "skill-designer"
SKILL_MD_PATH = SKILL_DIR / "SKILL.md"
REFERENCES_DIR = SKILL_DIR / "references"
ASSETS_DIR = SKILL_DIR / "assets"
SCENARIOS = Path(__file__).parent / "scenarios"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def parse_frontmatter(text: str) -> dict[str, str]:
    match = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    assert match, "SKILL.md must start with YAML frontmatter"
    data: dict[str, str] = {}
    for line in match.group(1).splitlines():
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip().strip('"')
    return data


def test_parse_frontmatter_smoke():
    sample = "---\nname: demo\ndescription: demo text\n---\n# demo\n"
    assert parse_frontmatter(sample) == {
        "name": "demo",
        "description": "demo text",
    }


REFERENCE_FILES = [
    "patterns.md",
    "pattern-selection.md",
    "audit-checklist.md",
    "repo-conventions.md",
]

ASSET_FILES = [
    "skill-template.md",
    "reference-template.md",
    "audit-report-template.md",
]


def test_required_reference_files_exist():
    for name in REFERENCE_FILES:
        assert (REFERENCES_DIR / name).is_file(), f"missing reference file: {name}"


def test_required_asset_files_exist():
    for name in ASSET_FILES:
        assert (ASSETS_DIR / name).is_file(), f"missing asset file: {name}"


def test_audit_checklist_defines_severity_rubric():
    text = read(REFERENCES_DIR / "audit-checklist.md")
    for label in ["blocking", "major", "minor", "advisory"]:
        assert f"`{label}`" in text
    for bucket in ["required fixes", "strong recommendations", "optional polish"]:
        assert bucket in text


def test_audit_report_template_has_required_sections():
    text = read(ASSETS_DIR / "audit-report-template.md")
    for section in [
        "Skill:",
        "Mode:",
        "Pattern mix:",
        "Audit status:",
        "Findings",
        "Required fixes",
        "Strong recommendations",
        "Optional polish",
        "Packaging/resource notes",
    ]:
        assert section in text


def test_patterns_reference_covers_all_five_patterns():
    text = read(REFERENCES_DIR / "patterns.md")
    for pattern in [
        "Tool Wrapper",
        "Generator",
        "Reviewer",
        "Inversion",
        "Pipeline",
    ]:
        assert pattern in text


def test_repo_conventions_reference_mentions_local_skill_rules():
    text = read(REFERENCES_DIR / "repo-conventions.md")
    for phrase in [
        "concise descriptions",
        "lean `SKILL.md` bodies",
        "references for detailed guidance",
        "assets only when reusable output structure exists",
        "scripts only when deterministic execution is worth the maintenance cost",
        "no extra documentation clutter",
    ]:
        assert phrase in text


def test_pattern_selection_reference_has_decision_prompts():
    text = read(REFERENCES_DIR / "pattern-selection.md")
    for phrase in [
        "teaches conventions",
        "produces templated output",
        "evaluates against a standard",
        "must interview first",
        "has ordered gated steps",
        "smallest viable pattern mix",
    ]:
        assert phrase in text


def test_reference_files_stay_compact():
    for name in REFERENCE_FILES:
        line_count = len(read(REFERENCES_DIR / name).splitlines())
        assert line_count <= 160, f"{name} is too long for a focused reference file"


def test_skill_template_has_required_sections():
    text = read(ASSETS_DIR / "skill-template.md")
    for phrase in [
        "name: <skill-name>",
        "description: <trigger-rich description>",
        "## Overview",
        "## Workflow",
        "## Resource Map",
        "## Output Expectations",
    ]:
        assert phrase in text


def test_reference_template_has_required_sections():
    text = read(ASSETS_DIR / "reference-template.md")
    for phrase in [
        "# <reference title>",
        "## Purpose",
        "## When to Load",
        "## Key Rules",
        "## Examples or Decision Points",
    ]:
        assert phrase in text


def test_asset_templates_stay_compact():
    for name in ASSET_FILES:
        line_count = len(read(ASSETS_DIR / name).splitlines())
        assert line_count <= 80, f"{name} is too long for a focused template"


def test_skill_markdown_exists():
    assert SKILL_MD_PATH.is_file()


def test_frontmatter_uses_only_name_and_description():
    data = parse_frontmatter(read(SKILL_MD_PATH))
    assert set(data) == {"name", "description"}
    assert data["name"] == "skill-designer"


def test_description_mentions_create_audit_and_pattern_language():
    description = parse_frontmatter(read(SKILL_MD_PATH))["description"]
    for phrase in [
        "Create or audit agent skills",
        "Tool Wrapper",
        "Generator",
        "Reviewer",
        "Inversion",
        "Pipeline",
        "designing a new skill",
        "reviewing a skill",
    ]:
        assert phrase in description


def test_skill_markdown_has_create_and_audit_sections():
    text = read(SKILL_MD_PATH)
    for heading in [
        "## Overview",
        "## Decide the Mode",
        "## Create Workflow",
        "## Audit Workflow",
        "## Pattern Selection Rules",
        "## Resource Selection Rules",
        "## Output Expectations",
        "## Reference Map",
    ]:
        assert heading in text


def test_skill_markdown_contains_required_gates():
    text = read(SKILL_MD_PATH)
    for phrase in [
        "Do not draft the skill until the interview phase is complete.",
        "Do not recommend scripts unless the task needs deterministic execution.",
        "Do not mark the skill complete until it passes the audit checklist.",
        "If information is insufficient, stop short of drafting full files",
    ]:
        assert phrase in text


def test_skill_markdown_links_to_all_reference_and_asset_files():
    text = read(SKILL_MD_PATH)
    for relpath in [
        "references/patterns.md",
        "references/pattern-selection.md",
        "references/audit-checklist.md",
        "references/repo-conventions.md",
        "assets/skill-template.md",
        "assets/reference-template.md",
        "assets/audit-report-template.md",
    ]:
        assert relpath in text


def test_skill_markdown_does_not_hardcode_repo_specific_absolute_paths():
    text = read(SKILL_MD_PATH)
    assert "D:/Git/lif-design-platform/repos/agent-toolkit" not in text
    assert "C:\\Users\\peter\\" not in text


from evals.helpers import parse_frontmatter as parse_scenario_frontmatter

# --- Behavioral tests (1 API call in quick, 2 in full) ---


def test_create_runs_interview_before_drafting(run_scenario, judge):
    scenario = SCENARIOS / "create-tool-wrapper.md"
    text = scenario.read_text(encoding="utf-8")
    meta = parse_scenario_frontmatter(text)
    output = run_scenario(scenario)

    # structural: contains a question
    assert "?" in output, "expected at least one interview question"
    # structural: no SKILL.md frontmatter drafted
    assert not re.search(
        r"```ya?ml\s*\nname:", output
    ), "should not produce SKILL.md frontmatter in first response"

    verdict = judge(output, meta["pass_criteria"], meta["fail_criteria"])
    assert verdict.passed, verdict.reason


def test_create_near_miss_skips_interview(run_scenario, judge):
    scenario = SCENARIOS / "create-near-miss.md"
    text = scenario.read_text(encoding="utf-8")
    meta = parse_scenario_frontmatter(text)
    output = run_scenario(scenario)

    # structural: should NOT start an interview (no "what is the job" style questions)
    interview_phrases = ["what is the job", "what triggers", "what output shape"]
    for phrase in interview_phrases:
        assert (
            phrase not in output.lower()
        ), f"should not start interview, found: '{phrase}'"

    verdict = judge(output, meta["pass_criteria"], meta["fail_criteria"])
    assert verdict.passed, verdict.reason


def test_audit_proposes_structured_approach(run_scenario, judge):
    scenario = SCENARIOS / "audit-severity-categories.md"
    text = scenario.read_text(encoding="utf-8")
    meta = parse_scenario_frontmatter(text)
    output = run_scenario(scenario)

    # structural: uses categorized findings (any severity-like structure)
    output_lower = output.lower()
    severity_terms = [
        "blocking",
        "major",
        "minor",
        "advisory",
        "critical",
        "warning",
        "error",
        "severity",
        "priority",
    ]
    found = sum(1 for t in severity_terms if t in output_lower)
    assert (
        found >= 1
    ), f"expected categorized severity findings, found none of {severity_terms}"
    # should not claim pass before analysis
    first_100 = output_lower[:100]
    assert (
        "passes" not in first_100 and "pass" not in first_100
    ), "should not claim pass before analysis"

    verdict = judge(output, meta["pass_criteria"], meta["fail_criteria"])
    assert verdict.passed, verdict.reason


def test_audit_near_miss_still_uses_rubric(run_scenario, judge):
    scenario = SCENARIOS / "audit-near-miss.md"
    text = scenario.read_text(encoding="utf-8")
    meta = parse_scenario_frontmatter(text)
    output = run_scenario(scenario)

    output_lower = output.lower()
    severity_terms = [
        "blocking",
        "major",
        "minor",
        "advisory",
        "critical",
        "warning",
        "error",
        "severity",
        "priority",
    ]
    found = sum(1 for t in severity_terms if t in output_lower)
    assert found >= 1, f"expected severity rubric even for style review, found none"

    verdict = judge(output, meta["pass_criteria"], meta["fail_criteria"])
    assert verdict.passed, verdict.reason
