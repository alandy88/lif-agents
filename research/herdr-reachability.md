# Research: Herdr reachability and session addressing from the Hermes gateway

Resolves issue #35. Read-only investigation on peter-macmini, 2026-08-16. No sessions, workspaces, tabs or panes were created, closed, focused or written to.

## Verdict

**Yes — the Hermes gateway can drive Herdr directly, with no privilege work required.** Both the gateway and every Herdr server run as `firstmate`, and Herdr's control sockets are mode `0600` under the invoking user's own `~/.config/herdr/`. Same uid, same home, direct connect. Nothing blocks it.

Three things change the design, though, and one challenges an out-of-scope ruling on the map.

## 1. Socket layout and ownership

Sockets live under the user's config dir, not a shared runtime dir:

| Session | Socket |
|---|---|
| default | `/Users/firstmate/.config/herdr/herdr.sock` |
| named `<n>` | `/Users/firstmate/.config/herdr/sessions/<n>/herdr.sock` |

```
srw-------  1 firstmate  staff  0 Aug 16 11:04 herdr.sock
srw-------  1 firstmate  staff  0 Aug 16 11:04 herdr-client.sock
```

Mode `0600`, owner `firstmate`. This is the whole answer to the identity question: any process running as `firstmate` connects; nothing else can, regardless of group. It also independently confirms the map's single-host constraint — the socket is a filesystem object in a local home directory.

Each session dir also carries `herdr-server.log`, `herdr-client.log` and `session.json`, all `0644` — useful for diagnostics without touching the socket.

Firstmate resolves the path per session by parsing `.socket_path` out of the session listing rather than constructing it (`fm_backend_herdr_presentation_session_socket_path`, `herdr.sh:716`), then canonicalises it so `/tmp` and `/private/tmp` cannot yield two identities for one socket. Worth copying — the layout above is an observation, not a documented contract.

## 2. Session addressing

`herdr session list` is the discovery surface and prints name, status, directory and socket. Session selection is a **global** flag (`herdr --session <name> ...`), not a per-subcommand option — `herdr pane list --help` shows only `--workspace`. Firstmate appends an explicit trailing `--session` on every single invocation through one wrapper (`fm_backend_herdr_cli`) precisely because env vars alone are untrusted when a second server may be running.

That precaution is not theoretical here. **Six `herdr server` processes are live**, of which four are orphans from the abandoned Kanban boards:

```
54143  /opt/homebrew/opt/herdr/bin/herdr server
80871  /opt/homebrew/bin/herdr server
63483  herdr server --session fm-kb-t524d25e9-phase0a
65134  herdr server --session fm-kb-t6ac97737-phase0b
67719  herdr server --session fm-kb-t232a291e-phase0d
70894  herdr server --session fm-kb-t793dd131-phase0e
```

Two of those resolve to the same binary via symlink and neither carries `--session`, so there appear to be two servers contending for the default session. Session dirs also exist for `shared-default` and `fm-lab-scout-herdr-pi-s-58756-17219` with no matching live process.

A dedicated `hermes` session therefore needs nothing special — creating it materialises `sessions/hermes/` — but the plugin must pass `--session hermes` explicitly on every call and must never rely on ambient environment.

**Flagged for the human, not actioned:** the four `fm-kb-*` servers and the two default-session servers look like leftovers worth reaping. Cleanup would be `herdr --session fm-kb-<id> server stop` per orphan, run as `firstmate`. Not run here — out of scope for a read-only ticket and Firstmate is live.

## 3. `HERDR_ENV` / `HERDR_PANE_ID` are spawnee-side only

Inside a pane, Herdr sets `HERDR_ENV=1`, `HERDR_SOCKET_PATH`, `HERDR_PANE_ID`, `HERDR_WORKSPACE_ID`, `HERDR_TAB_ID`. Every integration hook gates on exactly these and exits silently otherwise:

```sh
[ "${HERDR_ENV:-}" = "1" ] || exit 0
[ -n "${HERDR_SOCKET_PATH:-}" ] || exit 0
[ -n "${HERDR_PANE_ID:-}" ] || exit 0
```

The gateway is a **spawner**, so none of these are set in its environment and none should be. It addresses Herdr by explicit socket path plus `--session`, and learns pane/tab/workspace ids from the responses to its own create calls — which it must then persist as the worker binding (`task_runs.metadata`). The `herdr integration install hermes` plugin solves the opposite problem (Hermes running *inside* a pane reporting its own state) and is **not** what this plugin needs. It is currently absent at both `~/.hermes/plugins/` and `/opt/hermes-state/.hermes/plugins/`.

## 4. Push events are reachable — but the protocol version has moved

Push events are reachable: the socket is connectable by the gateway's uid, and Firstmate already subscribes to `pane.agent_status_changed` over a raw Unix socket from a plain Python client (`herdr-eventwait.py`), so there is no special client requirement.

**However — installed Herdr is 0.8.0 speaking `protocol: 19`, while Firstmate's raw-socket code targets protocol 16.** `herdr api schema` reports `protocol: 19, schema_version: 1` with schemas `error_response, event, request, subscription_event, success_response`. Any raw-socket code vendored from Firstmate must be re-validated against protocol 19 rather than assumed working. This affects `herdr-eventwait.py` and `herdr-workspace-move.py`.

## 5. Herdr has native supervision primitives Firstmate does not use

The CLI surface is much richer than "spawn a pane and scrape it":

- `herdr agent wait <target> --until <idle|working|blocked|done|unknown> --timeout <ms>` — a **blocking wait on agent state**, with an explicit `unknown` in the vocabulary. This is close to the supervision primitive the map assumes we must build from busy-state files plus polling.
- `herdr agent get|list|read|prompt|send-keys|explain|attach|start` — `explain` reports *why* Herdr believes an agent is in a given state.
- `herdr pane run|read|wait-output|send-text|split|close`, plus `workspace`, `worktree`, `tab`, `notification` subcommands.

`herdr agent wait` deserves scrutiny in the vendoring-boundary ticket (#36). It does not override Firstmate's hard-won rule that native `idle` is untrustworthy while a harness sits in a long foreground tool call — but a native wait primitive with a real `unknown` state may reduce how much of the busy-state layer needs vendoring at all.

## 6. Out-of-scope challenge: Herdr ships a Codex integration

`herdr integration status` lists built-in agent-state integrations for pi, omp, **claude**, **codex**, copilot, devin, droid, kimi, opencode, kilo, **hermes**, qodercli, cursor, mastracode, antigravity-cli, grok. On the `firstmate` account, two are installed:

```
INSTALLED: /Users/firstmate/.claude/hooks/herdr-agent-state.sh
INSTALLED: /Users/firstmate/.codex/herdr-agent-state.sh
absent:    /Users/firstmate/.pi/agent/extensions/herdr-agent-state.ts
absent:    /Users/firstmate/.hermes/plugins/herdr-agent-state/__init__.py
```

The map rules Codex out of scope because its turn state is unobservable. That reasoning came from Firstmate's own wiring, and Herdr claims a Codex integration independently — so the premise deserves a second look.

Reading the installed hook, though, the ruling mostly **survives**: `/Users/firstmate/.codex/herdr-agent-state.sh` (`HERDR_INTEGRATION_VERSION=7`) accepts only `action=session` and exits 0 for everything else. It registers an agent session with the pane; it does not report turn boundaries. So Herdr can detect *that* a Codex agent occupies a pane, but still not *when a turn ends*.

Two caveats worth one ticket rather than silent acceptance: the Pi extension is **not** installed at Herdr's default path (Firstmate writes its own per-task extension instead), so Herdr's native Pi integration is untested here and may be better than Firstmate's; and `herdr agent explain` may expose detection signal for Codex that neither Firstmate nor this research has characterised.

## Commands not run, for the human

```sh
# reap orphaned session servers (run as firstmate)
herdr --session fm-kb-t524d25e9-phase0a server stop
herdr --session fm-kb-t6ac97737-phase0b server stop
herdr --session fm-kb-t232a291e-phase0d server stop
herdr --session fm-kb-t793dd131-phase0e server stop

# create the dedicated session (materialises sessions/hermes/)
herdr --session hermes server
```

## Environment as observed

| Fact | Value |
|---|---|
| Herdr version | 0.8.0 (`/opt/homebrew/Cellar/herdr/0.8.0/bin/herdr`) |
| API protocol | 19, schema_version 1 |
| Gateway | `hermes gateway run`, pid 54546, uid `firstmate`, parent `gateway-with-dashboard.sh` |
| Dashboard | `hermes dashboard --port 9119 --host 0.0.0.0 --insecure` |
| Herdr config | `/Users/firstmate/.config/herdr/config.toml` (`onboarding = false`) |
| Live herdr servers | 6 (2 default-session, 4 orphaned `fm-kb-*`) |
