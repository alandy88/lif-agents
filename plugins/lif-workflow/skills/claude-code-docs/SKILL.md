---
name: claude-code-docs
disable-model-invocation: true
description: "Use when the user asks how any Claude Code feature works or is configured (hooks, skills, MCP, settings, subagents, SDK) — prefer over training data."
---

# claude-code-docs

Fetch authoritative answers from the official Claude Code docs at `code.claude.com/docs` instead of relying on training-data recall. The product ships weekly; anything you "remember" about plugin schemas, hook events, SDK flags, or slash commands may already be wrong.

## When to use this

Trigger on anything about the *Claude Code product itself*:

- Features: hooks, skills, subagents, plugins, MCP, memory/CLAUDE.md, slash commands, routines, channels, checkpointing, output styles, fast mode, sandboxing, computer use, voice dictation
- Configuration: `settings.json`, environment variables, permission modes, keybindings, statusline, `.claude/` directory layout, server-managed settings
- CLI: flags, headless mode, `--teleport`, `--remote`, `/loop`, `/schedule`
- SDKs: Agent SDK (Python, TypeScript), hooks, custom tools, permissions, plugins in SDK, observability
- Surfaces: terminal, Desktop, VS Code, JetBrains, Web, Chrome, Slack, mobile
- Enterprise: Bedrock, Vertex AI, Microsoft Foundry, GitHub Enterprise Server, LLM gateways, corporate proxies, ZDR, analytics

Do **not** use this for general coding questions or for the Claude API / Anthropic SDK (the latter has its own `claude-api` skill).

## Workflow

1. **Identify the topic.** Map the user's question to one or two pages using `references/index.md` (grouped topic → URL map). If the mapping is ambiguous, fetch `https://code.claude.com/docs/llms.txt` for the live full index — it is cheap and authoritative.
2. **Fetch the `.md` variant.** Every doc page has a markdown twin at `…page.md`. Always fetch the `.md` URL, not the HTML page — it is cleaner, shorter, and renders better via WebFetch. Example: `https://code.claude.com/docs/en/hooks.md`.
3. **Answer from the fetched content.** Quote short, exact snippets (config keys, event names, flag names) rather than paraphrasing — API surface and schema keys change and must be exact. When you quote, cite the source page URL so the user can verify.
4. **Follow cross-links as needed.** If the first page points at a reference (e.g. `hooks-guide.md` → `hooks.md`), fetch the reference before answering schema-level questions.
5. **Prefer one targeted fetch over many.** If the user's question is broad ("what can plugins do?"), read the overview page first (`plugins.md`) before drilling into `plugins-reference.md`. Avoid fan-out fetches on topics the index clearly disambiguates.

## When to delegate to the `claude-code-guide` agent instead

Use the agent (not this skill) when:

- The question spans many pages and the synthesised answer would be long — the agent keeps fetched doc content out of the main context window.
- The user wants a tutorial-style walkthrough built from multiple pages.

Use this skill (not the agent) when:

- The user asks a pointed question about one feature and wants an answer in the current conversation.
- You need the exact schema/flag/event name to paste into a config file you are about to edit.

## Patterns to avoid

- **Don't guess URLs.** The site has been rehosted (`docs.anthropic.com/en/docs/claude-code/` → `code.claude.com/docs/en/`) and page slugs have changed. Use the index.
- **Don't answer from memory about schemas.** Hook event names, settings keys, and plugin manifest fields are the first things to shift across releases. Fetch before quoting.
- **Don't conflate Claude Code with the Anthropic API.** They are separate products with separate docs. If the user is building with `@anthropic-ai/sdk`, switch to the `claude-api` skill.

## Reference

- `references/index.md` — topic → URL map, grouped by area. Read this first for topic routing.
- Live index: `https://code.claude.com/docs/llms.txt` — canonical LLM-friendly sitemap; fetch when `references/index.md` misses a topic (e.g. a brand-new page).
