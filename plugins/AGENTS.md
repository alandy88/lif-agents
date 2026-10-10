# plugins/

Claude Code plugin marketplace for the cross-repository workflow skills. The marketplace
manifest is `.claude-plugin/marketplace.json` at the repo root so the marketplace installs
from GitHub; this directory holds the plugins, the skill evals, and the naming doc.

- `lif-workflow/` — the skills plugin: `skills/`, `agents/` (the four shipit role agents and the eight `factory-*` agents of the `factory` skill), `hooks/hooks.json`, `scripts/hooks/`.
  Skills here are the ones that must resolve from any repo (handoff, pickup, planning,
  backlog, issue and PR loops, Codex fanout). Skills bound to one repo live in that repo's
  `.agents/skills/` (with `.claude/skills` symlinked to it) and are not installed through
  a plugin: `lif-workbench` for character, prompt, image, and LoRA work; `comfyui-lif-nodes`
  for node development; `lif-openclaw-agents` for persona setup.
- `lif-effort/` — a mod (function hooks, not skills): automatic model and effort, Haiku
  compaction, handoffs, agents panel. Its own checks are `claude plugin validate`,
  `claude plugin test` and `bunx tsc -p` on its folder; the root `bun run test` does not
  cover it. See [lif-effort/README.md](lif-effort/README.md).
- `evals/` — behavioural evals (`uv run --no-project --with pytest --with pyyaml pytest evals` from `plugins/`, add
  `--full` for the LLM judge). Skill lookup searches this plugin first, then
  `$LIF_WORKBENCH_ROOT/.agents/skills` and `$COMFYUI_LIF_NODES_ROOT/.agents/skills`;
  evals for skills that are not checked out are skipped, not failed.
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
