# lif-effort

A Claude Code mod that picks the model and effort for you, with a small status line and bar above the prompt:

```text
~/repo  main*  ·  ctx 42%  ·  5h 31% (2h10m)  ·  wk 12% (Thu)
Sonnet 5.5 · High · Auto     [ Compact ] [ Handoff ] [ Review ] [ Agents (2) ]
```

- **Session model.** The first substantive prompt (four words or more, not "continue")
  gets one Haiku 5.5 call that picks Opus, Sonnet or Haiku 5.5 and a starting effort.
  The model is kept for the rest of the session.
- **Effort per prompt.** Each later prompt gets one Haiku call that picks effort only,
  from the prompt and the last few messages. "continue", "ok" and similar keep the
  previous effort without a call. Haiku requests are sent with no effort setting.
- **Compaction.** `/compact` and automatic compaction use a Haiku 5.5 summary. If Haiku
  fails or its summary is unusable, the native compaction runs instead.
- **Handoff.** Writes `HANDOFF.md`, then clears and continues, clears and waits, or only
  saves.
- **Review.** `/lif-effort review` prints a CAFE(S) review of the session, with actions.
- **Status line.** One dim line above the bar: directory, git branch (`*` when
  uncommitted), context use, and the 5-hour and weekly plan limits with time to reset.
  Context turns yellow above 15%, orange above 20%, and red above 30%. Limits turn
  yellow at 70% and red at 90%. Limits show only on a Claude
  subscription, after the first response.
- **Agents.** A panel listing the session's subagents, from Claude Code's own
  `$.agent.list()`.

## Install

```text
/plugin install lif-effort --marketplace alandy88/lif-agents
```

Or `claude plugin install lif-effort@lif-agents` after `claude plugin marketplace add
alandy88/lif-agents`. To try it from this checkout for one session only:
`claude --plugin-dir ./plugins/lif-effort`.

Do not enable it together with HeyCubit's Effortless: both rewrite the same requests.

## Settings

All settings live in `/config`, under the plugin. They are saved as plugin configuration
in `settings.json` under `pluginConfigs`.

| Setting | Default | What it does |
| --- | --- | --- |
| Automatic session model | On | Off: the session's own model is used. |
| Allowed models | All three | Restricts the pick. A disallowed pick moves to the nearest allowed model, the stronger one on a tie. |
| Automatic effort | On | Off: the session's own effort is used. |
| Effort floor / ceiling | Low–Extra high | Bounds automatic effort. Not applied to Haiku. |
| Effort preference | Balanced | How unclear prompts lean: cheaper, balanced or deeper. |
| Compaction model | Haiku | `session` always uses the native compaction. |
| After handoff | Start fresh and wait | `continue`, `wait` or `save`. |
| Agent visibility | Active only | `all` also lists finished agents. |
| Show classification reason | Off | Shows Haiku's short reason in the bar. |
| Show status line | On | Turns the line above the bar on or off. |
| Brief the first prompt | On | On a session's first substantive prompt, one more Haiku call (up to 12 seconds) adds a short task brief the model reads beside your words. Your prompt is never replaced. Skipped after a handoff. |

The classifier is always Haiku 5.5, with a 4-second limit. A failed, late or malformed
answer changes nothing: the request goes out as it would without the mod.

## Controls

| Bar control | Hotkey | Command |
| --- | --- | --- |
| The mode word (`Auto`, `Manual effort`, `Off`) | `m` | `/lif-effort auto [on\|off]` |
| Compact | `c` | `/compact` |
| Handoff | `h` | `/lif-effort handoff` |
| Review | `r` | `/lif-effort review` |
| Agents (n) | `a` | `/lif-effort agents` |

Press `ctrl+x` then `tab` to move the keyboard to the bar, then press a hotkey. On a
terminal narrower than 64 columns the bar shows the commands instead of buttons.
`/lif-effort status` prints what requests use next to the app's own setting.

The mode word turns all automation off. Pressed again, it turns automation back on,
including automatic effort after a manual effort change.

The Compact button puts `/compact` into an empty prompt box for you to send. Claude Code
skips a plugin's own hooks when that plugin starts the compaction itself, so the Haiku
summary only runs when you send the command. With the compaction model set to `session`
the button compacts at once.

## How it applies the choice

The mod changes each main model request as it is sent, in the `turn.step` hook. It never
changes the app's own model or effort settings. Subagent requests are never changed.

So two values can differ:

- **The app's own setting**: what the model picker, `/effort` and the status line show.
- **What requests use**: what the bar and `/lif-effort status` show.

Why not change the app's setting: on Claude Code 2.1.295, the one model writer a mod has,
`$.config.set({ key: 'model' })`, also saves the model to `settings.json`, so an
automatic pick would leak into every later session. There is no session-only model or
effort setter, and no way to read the app's effort before the first request.

## Lifecycle

| Event | Effect |
| --- | --- |
| You change the model (`/model`, the picker) | Automatic model is off for this session. Automatic effort keeps working. |
| You change the effort (`/effort`) | Automatic effort is off until you turn it back on. |
| A prompt typed while a turn runs | Its effort applies from the next turn. The running turn keeps its own. |
| Reload or `--resume` | The session's selection comes back. Each session keeps its own. |
| Compaction | The model and effort stay. |
| `/clear` or a handoff | A new selection cycle. Your Auto on or off choice carries over. |
| The mod loaded into a session that already ran | The session's model stays. Effort is still automatic. |

Prompts from notifications, peers, channels and other plugins are not classified.
Neither are compaction summaries, handoff text, or the classifier's own calls.

## Review

`/lif-effort review [focus]` asks the model to review the session so far against the
CAFE(S) framework (Clarity, Actionability, Fidelity, Efficiency, Security). It prints a
rated review and up to five actions for next time in the transcript. It saves nothing.

## Handoff

1. Reads the repository state with `git status`, `git log` and `git diff --stat` only.
   It never commits, stashes, or changes any file but the handoff.
2. Asks the session's own model, through a fork of the conversation, to write the
   handoff.
3. Saves it as `HANDOFF.md`. If that file exists, you pick: keep both, overwrite, or
   cancel. Keeping both saves a dated name such as `HANDOFF-20261010-142501.md`.
4. Unless the setting is `save`, it asks before clearing the conversation. Nothing is
   cleared if writing or saving failed.
5. The new cycle classifies the handoff's "Next step", not the instruction to continue.

## Checks

```sh
claude plugin validate plugins/lif-effort
claude plugin test plugins/lif-effort
bunx tsc -p plugins/lif-effort --noEmit
```

`tsc` needs the engine's declarations in `.claude-plugin/types/`. Claude Code writes them
when it loads the folder through `--plugin-dir` in an interactive session. They are
gitignored.

Built against the 2.1.295 declarations. All checks ran on 2.1.296: 42 native tests, plus
live sessions in which a one-line question ran on Haiku at low effort, an architecture
question on Opus at high, `/compact` produced the Haiku summary, the Agents button opened
the panel, and a handoff saved, asked, cleared, and started the next cycle on Sonnet at
high from the carried task. The mode word and the Compact button are covered by native
tests only.

## Credits

The approach follows [HeyCubit/effortless](https://github.com/HeyCubit/effortless)
(MIT): per-request rewriting in `turn.step`, spotting a manual effort change from the
request's own effort, and a Haiku `session.compact`. No Effortless code is copied.
