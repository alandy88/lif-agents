from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from evals.helpers import (
    JudgeVerdict,
    build_judge_prompt,
    extract_body,
    parse_frontmatter,
    parse_judge_verdict,
)

import os

PLUGIN_SKILLS = Path(__file__).parent.parent / "lif-workflow" / "skills"


def _skill_roots() -> list[Path]:
    roots = [PLUGIN_SKILLS]
    for var in ("LIF_WORKBENCH_ROOT", "COMFYUI_LIF_NODES_ROOT"):
        value = os.environ.get(var)
        if value:
            roots.append(Path(value) / ".agents" / "skills")
    return roots


SKIP_VERDICT = JudgeVerdict(passed=True, reason="judge skipped (--full not set)")


def pytest_addoption(parser):
    parser.addoption(
        "--full",
        action="store_true",
        default=False,
        help="Run LLM-as-judge evaluations in addition to structural assertions",
    )


@pytest.fixture
def full(request):
    return request.config.getoption("--full")


@pytest.fixture
def skill_system_prompt():
    """Load SKILL.md content for a given skill name."""

    def _load(skill_name: str) -> str:
        for root in _skill_roots():
            path = root / skill_name / "SKILL.md"
            if path.exists():
                return path.read_text(encoding="utf-8")
        pytest.skip(
            f"skill '{skill_name}' is not in this plugin and no checkout of it was "
            "found; set LIF_WORKBENCH_ROOT / COMFYUI_LIF_NODES_ROOT to run this eval"
        )

    return _load


@pytest.fixture
def run_scenario(skill_system_prompt):
    """Run a scenario through claude --print. Returns the output string."""

    def _run(scenario_path: str | Path) -> str:
        scenario = Path(scenario_path)
        text = scenario.read_text(encoding="utf-8")
        meta = parse_frontmatter(text)
        system_prompt = skill_system_prompt(meta["skill"])
        user_message = extract_body(text)

        # Pipe user message via stdin to avoid Windows CLI length limits.
        # --system-prompt stays as a CLI arg (confirmed via claude --help).
        # SKILL.md is typically 2-5 KB, well under the 32K CreateProcess limit.
        result = subprocess.run(
            ["claude", "--print", "--system-prompt", system_prompt],
            input=user_message,
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"claude --print failed (exit {result.returncode}):\n{result.stderr}"
            )
        return result.stdout

    return _run


@pytest.fixture
def judge(full):
    """LLM-as-judge via claude --print. Returns SKIP_VERDICT unless --full is set."""

    def _judge(
        output: str,
        pass_criteria: list[str],
        fail_criteria: list[str],
    ) -> JudgeVerdict:
        if not full:
            return SKIP_VERDICT
        prompt = build_judge_prompt(output, pass_criteria, fail_criteria)
        # Pipe judge prompt via stdin to avoid CLI length limits
        result = subprocess.run(
            ["claude", "--print"],
            input=prompt,
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"judge call failed (exit {result.returncode}):\n{result.stderr}"
            )
        return parse_judge_verdict(result.stdout)

    return _judge
