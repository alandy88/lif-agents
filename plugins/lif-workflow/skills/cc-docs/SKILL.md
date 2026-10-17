---
name: cc-docs
disable-model-invocation: true
description: "Answers questions about Claude Code itself from the official docs at code.claude.com: fetches the live page index, then the matching page, and quotes exact keys, flags and event names. Use when the user asks how a Claude Code feature works or is configured (hooks, skills, plugins, MCP, settings, subagents, CLI flags, Agent SDK)."
---

# cc-docs

Answer from the official Claude Code docs, not from memory. Hook event names,
settings keys, plugin manifest fields and CLI flags change between releases, and
page addresses move.

Scope: the Claude Code product (features, configuration, CLI, Agent SDK,
surfaces, enterprise setup). Not general coding questions, and not the Claude
API, which has its own docs.

## Steps

1. Fetch the live index, `https://code.claude.com/docs/llms.txt`. Each entry is a
   page title, its URL and a one-line summary. Pick the one or two pages that
   match the question. Do not guess a URL.
2. Fetch those pages. The index gives `.md` URLs, such as
   `https://code.claude.com/docs/en/hooks.md`, which return Markdown. Use
   WebFetch; where the session has none, run `curl -sL` on the URL.
3. When the page is a guide and the question is about a schema, follow its link
   to the reference page before you answer: `hooks-guide.md`, then `hooks.md`.
4. Answer from the fetched text. Quote config keys, event names and flags
   exactly, and give the page URL so the user can check.

For a broad question ("what can plugins do?"), start on the overview page the
index lists for that area.

## When the answer would be long

When the question spans many pages or asks for a tutorial, and the session has
the `claude-code-guide` agent, hand the question to it. That keeps the fetched
pages out of this context.
