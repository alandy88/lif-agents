# lif-theme

A Claude Code mod that draws the conversation in a theme:

- **Prompts** in a padded box in the theme's prompt colour.
- **Replies** in a padded box in the theme's reply colour, with headings, inline code,
  bold, links, bullets, quotes and rules in the theme's colours.

It adds no status line: `lif-effort` draws one above the prompt.

The idea comes from [yugal1107/ui-themes](https://github.com/yugal1107/ui-themes). That
repository has no licence, so the code here is written from scratch.

## Install

```text
/plugin install lif-theme --marketplace alandy88/lif-agents
```

To try it from this checkout for one session only: `claude --plugin-dir ./plugins/lif-theme`.

## Settings

Both settings live in `/config`, under the plugin. They are saved as plugin configuration
in `settings.json` under `pluginConfigs`.

| Setting | Default | What it does |
| --- | --- | --- |
| Themed messages | On | Off: prompts and replies are drawn by Claude Code itself, as if the plugin were not installed. |
| Theme | `claude-warm` | `claude-warm`: terracotta prompts, charcoal replies. `night-blue`: navy prompts, near-black replies. `titanium`: steel blue prompts, grey replies. |

## Command

`/lif-theme` writes the same two settings, so the command and `/config` never disagree.

| Command | What it does |
| --- | --- |
| `/lif-theme` | Shows whether the boxes are on, and the themes with the current one in bold. |
| `/lif-theme <name>` | Switches to that theme. |
| `/lif-theme next` | Switches to the next theme. |
| `/lif-theme off` / `on` | Turns the themed boxes off or on. |

## Limits

- Code blocks and tables keep Claude Code's own drawing, inside the box.
- While a reply streams, Claude Code draws it. It moves into the box when the block ends.
- Task notifications and messages from other agents keep Claude Code's rows.
- A reply box replaces Claude Code's drawing of that reply, so a mod that sits beneath
  this one and decorates replies is not drawn while the boxes are on.
- The themes are built in (`hooks/themes.ts`). Add one there and in the `theme` options
  in `.claude-plugin/plugin.json`.

## Checks

```bash
claude plugin validate plugins/lif-theme
claude plugin test plugins/lif-theme
bunx tsc -p plugins/lif-theme
```

`tsc` needs `.claude-plugin/types/`, which the engine writes the first time it loads the
mod (`claude --plugin-dir ./plugins/lif-theme`).
