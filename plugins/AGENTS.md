# plugins/

Claude Code plugin marketplace for the cross-repository workflow skills. The marketplace
manifest is `.claude-plugin/marketplace.json` at the repo root so the marketplace installs
from GitHub; this directory holds the plugin itself, the skill evals, and the naming doc.

- `lif-workflow/` — the one plugin: `skills/`, `hooks/hooks.json`, `scripts/hooks/`.
  Skills here are the ones that must resolve from any repo (handoff, pickup, planning,
  backlog, issue and PR loops, Codex fanout). Skills bound to one repo live in that repo's
  `.agents/skills/` (with `.claude/skills` symlinked to it) and are not installed through
  a plugin: `lif-workbench` for character, prompt, image, and LoRA work; `comfyui-lif-nodes`
  for node development; `lif-openclaw-agents` for persona setup.
- `evals/` — behavioural evals (`uv run --with pytest --with pyyaml pytest evals`, add
  `--full` for the LLM judge). Skill lookup searches this plugin first, then
  `$LIF_WORKBENCH_ROOT/.agents/skills` and `$COMFYUI_LIF_NODES_ROOT/.agents/skills`.
- `docs/skill-naming-convention.md` — category prefixes and the inventory across repos.

Install and refresh:

```bash
claude plugin marketplace add alandy88/lif-agents
claude plugin install lif-workflow@lif-agents
claude plugin marketplace update lif-agents && claude plugin update lif-workflow@lif-agents
```

Plugins are copied into `~/.claude/plugins/cache` on install, so bump `version` in
`lif-workflow/.claude-plugin/plugin.json` before pushing or users will not receive the
change. For in-place iteration: `claude --plugin-dir ./plugins/lif-workflow`.

Codex has no plugin concept; the cross-repo skills are installed for it by symlinking
`plugins/lif-workflow/skills/*` into `~/.agents/skills/`.
