# Skill Naming Convention

## Format

`{category}-{specificity}`

## Category Registry

| Prefix | Scope | Examples |
|---|---|---|
| `api-` | Pure REST API wrappers (thin, stateless) | `api-civitai`, `api-danbooru`, `api-anilist` |
| `char-` | Character datafile CRUD + search | `char-search`, `char-add`, `char-update` |
| `danbooru-` | Danbooru tag generation/research (not API) | `danbooru-agent`, `danbooru-fashion`, `danbooru-outfit-tags` |
| `comfyui-` | ComfyUI dev + runtime | `comfyui-nodes` |
| `image-` | Image processing pipeline | (future candidates) |
| `job-` | Client job lifecycle | (future candidates) |
| `issue-` | Single-issue execution loops (interactive counterparts to swarm-pi prompts) | `issue-implement`, `issue-review` |
| `pr-` | Pull-request lifecycle on `alandy88` repos | `pr-shepherd` |
| `herdr-` | Herdr terminal-workspace layout over the local repos | `herdr-workspace` |

## Rules

1. New skills MUST use a registered category prefix (add new prefix if none fits)
2. Bare names allowed only for singletons that ARE the category (`image`)
3. Suffixes describe action or specificity, not domain
4. Max 3 segments: `{category}-{noun}-{qualifier}`
5. No verb-first names (`search-*`, `add-*`, `create-*`)

## Adding a New Category

Add a row to the registry table above. Pick a short noun prefix (3-8 chars). Update this doc and commit.

## Full Skill Inventory

Ownership follows the actor: node development lives with the nodes; character, prompt,
design, and operations work lives in lif-workbench and treats comfyui-lif-nodes as a data
store; skills that must resolve from any repo ship in the `lif-workflow` plugin.

| Skill | Category | Home |
|---|---|---|
| `api-civitai` | api | lif-workbench `.agents/skills/` |
| `api-danbooru` | api | lif-workbench `.agents/skills/` |
| `char-add` | char | lif-workbench `.agents/skills/` |
| `char-breasts-update` | char | lif-workbench `.agents/skills/` |
| `char-search` | char | lif-workbench `.agents/skills/` |
| `char-update` | char | lif-workbench `.agents/skills/` |
| `char-vault-search` | char | lif-workbench `.agents/skills/` |
| `civitai-brief` | — | lif-workbench `.agents/skills/` |
| `comfyui-mcp` | comfyui | lif-workbench `.agents/skills/` |
| `create-poses` | — | lif-workbench `.agents/skills/` |
| `danbooru-agent` | danbooru | lif-workbench `.agents/skills/` |
| `danbooru-fashion` | danbooru | lif-workbench `.agents/skills/` |
| `danbooru-outfit-tags` | danbooru | lif-workbench `.agents/skills/` |
| `douyin-export` | — | lif-workbench `.agents/skills/` |
| `format-prompts` | — | lif-workbench `.agents/skills/` |
| `image` | — | lif-workbench `.agents/skills/` |
| `image-matcher` | image | lif-workbench `.agents/skills/` |
| `log` | — | lif-workbench `.agents/skills/` |
| `lora-sync-3090` | — | lif-workbench `.agents/skills/` |
| `lora-train` | — | lif-workbench `.agents/skills/` |
| `notebooklm-danbooru` | — | lif-workbench `.agents/skills/` |
| `search-lora` | — | lif-workbench `.agents/skills/` |
| `smart-crop` | — | lif-workbench `.agents/skills/` |
| `comfyui-nodes` | comfyui | comfyui-lif-nodes `.agents/skills/` |
| `harem-agent-creator` | — | lif-openclaw-agents `.agents/skills/` |
| `new-agent-setup` | — | lif-openclaw-agents `.agents/skills/` |
| `backlog` | — | lif-agents `plugins/lif-workflow/` |
| `claude-code-docs` | — | lif-agents `plugins/lif-workflow/` |
| `claude-code-reviewer` | — | lif-agents `plugins/lif-workflow/` |
| `codex` | — | lif-agents `plugins/lif-workflow/` |
| `handoff` | — | lif-agents `plugins/lif-workflow/` |
| `herdr-workspace` | herdr | lif-agents `plugins/lif-workflow/` |
| `issue-implement` | issue | lif-agents `plugins/lif-workflow/` |
| `issue-review` | issue | lif-agents `plugins/lif-workflow/` |
| `markdown-to-docx` | — | lif-agents `plugins/lif-workflow/` |
| `morning-briefing` | — | lif-agents `plugins/lif-workflow/` |
| `obsidian-vault` | — | lif-agents `plugins/lif-workflow/` |
| `pickup` | — | lif-agents `plugins/lif-workflow/` |
| `plan-handoff` | — | lif-agents `plugins/lif-workflow/` |
| `pr-shepherd` | pr | lif-agents `plugins/lif-workflow/` |
| `retro` | — | lif-agents `plugins/lif-workflow/` |
| `seed` | — | lif-agents `plugins/lif-workflow/` |
| `skill-designer` | — | lif-agents `plugins/lif-workflow/` |
| `structured-planning` | — | lif-agents `plugins/lif-workflow/` |
| `wechat-auto` | — | lif-agents `plugins/lif-workflow/` |
