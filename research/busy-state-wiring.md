# Launch-time busy-state wiring per harness

Findings for [#34](https://github.com/alandy88/lif-agents/issues/34). Source: `/Users/firstmate/firstmate` on peter-macmini, read-only. All line references are to that checkout.

## The contract (bin/fm-busy-lib.sh, 986 lines)

`fm-busy-lib.sh` declares itself "the ONE owner of firstmate's semantic busy-state contract". Design source is a captain-approved redesign dated 2026-07-28. The governing rule:

> missing, malformed, stale, unsupported, or unverified semantic data is UNKNOWN - never idle. Endpoint death is the only process-level override and yields dead, never busy.

Explicitly rejected as state signals: child processes, CPU, process sleep state, marker mtimes, and the old global UI-regex OR. `state/<id>.turn-ended` files are wake **notifications** owned by the watcher, never current-state truth.

### Record file

`state/<id>.busy-state` — exactly one line, atomically replaced, written only by `bin/fm-busy-event.sh`:

```
v1 gen=<token> seq=<uint> state=<busy|idle|unknown> source=<token> event=<token> ts=<epoch>
```

### Gen sidecar

`state/<id>.busy-gen` — one token minted when wiring is armed. Every event must present the current gen; any other gen is a stale incarnation, **rejected** on write and **classified unknown** on read. `seq` is strictly increasing per gen, advanced under the writer's lock, so an out-of-order apply can never regress a newer record.

### Per-harness trust table

`fm_busy_sources_for_harness` owns it. A record whose source is not trusted for the task's recorded harness classifies unknown — "one adapter's writer can never classify another adapter". Trusted semantic sources:

| Source | Harness | Events |
|---|---|---|
| `claude-hook` | claude* | UserPromptSubmit / Stop / StopFailure / SessionEnd |
| `pi-ext` | pi, pi-signed | agent_start / agent_settled |
| `opencode-plugin` | opencode* | session.status |
| `codex-hook`, `codex-appserver` | — | reserved, gated, **never armed** |
| `kimi-wire`, `kimi-hook` | — | reserved, gated, never armed |

Firstmate-owned sources accepted for every converted adapter: `fm-spawn` (the launch-brief turn seeded at spawn), `fm-interrupt` (legacy Escape idle event), `fm-recovery` (documented recovery reset after relaunch).

Classifier-only sources, never written into a record: `endpoint-gone`, `herdr-native`, `grok-regex`, `muse-session-log`, `cursor-transcript`, `missing`, `malformed`, `gen-mismatch`, `source-mismatch`, `kimi-unverified`, `codex-unverified`, `capture-failed`, `no-target`.

### Classification precedence (`fm_busy_classify`)

Returns `busy | idle | unknown | dead`, always paired with the producing source.

1. dead endpoint (`fm_busy_classify_live` only) → `dead endpoint-gone`
2. standalone Kimi before verification → `unknown kimi-unverified`
3. a valid, gen-matching, source-trusted record → its state and source
4. no record at all: Herdr's native **busy** verdict is trusted (generation state is sufficient for busy, **not** for idle), then muse session-log and cursor transcript pull sources, then the Grok-only rendered-tail regex, then `unknown missing`
5. malformed, stale, or untrusted records → `unknown`, never a fallback

## Writer mechanics (bin/fm-busy-event.sh, 217 lines)

Three subcommands. Exit codes: `0` applied, `1` refused (stale gen, unarmed task, lock timeout, invalid input), `2` usage.

- **`arm <state-dir> <id>`** — mints a fresh gen, writes the sidecar, seeds the record at `seq=1` defaulting to `busy` / `fm-spawn` / `launch-brief`, because *the launch prompt IS a submitted turn*. Prints the gen on stdout so the caller embeds it into adapter wiring. Re-arming replaces the incarnation; old-gen events are stale from then on.
- **`apply <state-dir> <id> <state> (--gen G | --current-gen) --source S --event E`** — validates gen, advances seq under lock, atomically replaces the record.
- **`retire <state-dir> <id> (--gen G | --current-gen)`** — removes sidecar and record under the same lock. An exact gen prevents teardown of an old task from retiring a newly armed incarnation.

Gen minting is one line:

```bash
GEN="g$(date +%s).$$.$RANDOM"
```

Record write is tmp-then-rename:

```bash
printf 'v1 gen=%s seq=%s state=%s source=%s event=%s ts=%s\n' \
  "$1" "$2" "$NEW_STATE" "$SOURCE" "$EVENT" "$(date +%s)" > "$tmp" || return 1
mv -f "$tmp" "$REC"
```

Locking is `mkdir`-based mutual exclusion at `$REC.lock`, 40 tries at 50 ms, then stale-breaking after `FM_BUSY_LOCK_STALE_SECS` (default 5). `umask 077` throughout.

## Arming at spawn (bin/fm-spawn.sh:2305–2340)

```bash
case "$HARNESS" in
  claude*|opencode*|pi|pi-signed)
    BUSY_GEN=$("$FM_ROOT/bin/fm-busy-event.sh" arm "$STATE_REAL" "$ID") || {
      echo "error: failed to arm the busy-state contract for $ID" >&2
      exit 1
    }
    [ "$RELAUNCH" -ne 1 ] || RELAUNCH_REPLACEMENT_BUSY_GEN=$BUSY_GEN
    ;;
esac
```

Codex and Kimi both **hard-error** if their capability probe ever opens without wiring being implemented — "Arming without wiring would seed a busy record nothing can ever clear". That fail-closed pairing is deliberate and worth copying.

The gen is persisted into the task meta as `busy_gen=` (fm-spawn.sh:2653) alongside `spawn_gen`, `herdr_session`, `herdr_workspace_id`, `herdr_tab_id`, `herdr_pane_id`.

## Claude wiring

Written **inside** the worktree at `<WT>/.claude/settings.local.json` — note `settings.local.json`, not `settings.json` — then registered with `exclude_path '.claude/settings.local.json'` so it never enters git.

```json
{"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"<CMD> busy <SUFFIX> --event user-prompt-submit 2>/dev/null || true"}]}],"Stop":[{"hooks":[{"type":"command","command":"touch <TURNEND>; <CMD> idle <SUFFIX> --event stop 2>/dev/null || true"}]}],"StopFailure":[{"hooks":[{"type":"command","command":"<CMD> idle <SUFFIX> --event stop-failure 2>/dev/null || true"}]}],"SessionEnd":[{"hooks":[{"type":"command","command":"<CMD> idle <SUFFIX> --event session-end 2>/dev/null || true"}]}]}}
```

where

```
CMD    = <FM_ROOT>/bin/fm-busy-event.sh apply <STATE_REAL> <ID>
SUFFIX = --gen <BUSY_GEN> --source claude-hook
```

**The gen token is embedded literally in the hook command string** — not an env var, not a file read. That is what makes a hook outliving its incarnation fail closed at the writer.

Event mapping: `UserPromptSubmit` opens a turn; `Stop` (normal completion), `StopFailure` (API-error turn end) and `SessionEnd` (process shutdown) all close it, "so an abnormal end can never leave a stale busy record". Claude fires **no hook for a manual interrupt** — `fm-control` preserves adapter-owned state, while the legacy `fm-send --key Escape` path records `idle`/`fm-interrupt`. Every command ends `|| true` so a refused stale-gen write can never break Claude's own lifecycle.

## Pi wiring

Written **outside** the worktree at `state/<id>.pi-ext.ts`, and the comment states the reason as live-verified:

> pi's project-trust gate fires on any extension loaded from inside the project (verified live), but an explicit `-e` path elsewhere loads without a dialog. Lives in `state/`, cleaned by teardown.

Loaded via the launch template (fm-spawn.sh:1128):

```
__PIBIN____PITUIMODE__ __MODELFLAG____EFFORTFLAG__-e __PIEXT__ "$(__OPINPUT__ encode launch-brief < __BRIEF__)"
```

`__PIEXT__` resolves to the absolute `state/<id>.pi-ext.ts` (fm-spawn.sh:2710). Full extension body:

```typescript
import { execFile } from "node:child_process";
const busyEvent = (state: string, event: string) =>
  new Promise<void>((resolve) => {
    execFile("<FM_ROOT>/bin/fm-busy-event.sh", [
      "apply", "<STATE_REAL>", "<ID>", state,
      "--gen", "<BUSY_GEN>", "--source", "pi-ext", "--event", event,
    ], () => resolve());
  });
export default function (pi: any) {
  pi.on("agent_start", () => busyEvent("busy", "agent-start"));
  pi.on("agent_settled", (_event: any, ctx: any) => {
    if (ctx && typeof ctx.isIdle === "function" && !ctx.isIdle()) return;
    return busyEvent("idle", "agent-settled");
  });
  pi.on("turn_end", () => execFile("touch", ["<TURNEND>"]));
}
```

The `ctx.isIdle()` guard is load-bearing: `agent_settled` maps to idle **only** when Pi confirms it will not continue automatically. Auto-retries, auto-compaction retries, tool loops and queued continuations all keep the run un-settled, and a settle that raced another extension's fresh run keeps state busy. `turn_end` fires at every inner turn boundary and is only a wake notification.

## What changes when the spawner is the Hermes plugin

**Portable as-is (harness-side, no Firstmate dependency):** both wiring artifacts. The Claude JSON and the Pi TypeScript reference only an absolute path to a writer binary, a state dir, a task id, and a gen string. Point them at a vendored `fm-busy-event.sh` and they work unchanged.

**Must be recreated by our `spawn_fn`, in this order, all before the harness process starts:**

1. Choose a state dir; `arm` to mint the gen and seed `busy`/`fm-spawn`/`launch-brief`.
2. Persist the gen into `task_runs.metadata` — it is the incarnation identity, the analogue of Firstmate's meta `busy_gen=`.
3. Materialise the per-harness wiring file with the gen embedded literally, at the right side of the worktree boundary (Claude inside + git-excluded, Pi outside).
4. For Pi, append `-e <abs path>` to the launch argv.
5. On teardown, `retire` with the **exact** gen.

**Naturally absent:** Codex and Kimi arms — both are already fail-closed no-ops, matching the out-of-scope decision on the map.

**One correction to the map's framing.** The map and ticket both say the Claude hooks live in `.claude/settings.json`. They are actually written to `.claude/settings.local.json`, which matters because it is the file Claude treats as local-only and which Firstmate additionally git-excludes. Worth fixing in the spec so an implementer does not clobber a real `settings.json`.

## Hardest thing to port

**The worktree-boundary asymmetry, and the trust gates that force it.** Claude's wiring must be *inside* the worktree (and therefore git-excluded, or it pollutes the repo the worker is about to commit), while Pi's must be *outside* it (or Pi's project-trust dialog blocks an unattended launch). Neither placement is a preference; each is a live-verified workaround for a different harness's trust model, and each fails in a way that is quiet rather than loud — a committed `settings.local.json` shows up as spurious diff noise in the worker's own PR, and an inside-the-worktree Pi extension hangs at a dialog no one is watching. Grok's global-hook-plus-token-pointer dance in the same `case` statement is the third variant of this same problem, which suggests the count grows with every harness added.

A Hermes plugin cannot abstract this away behind one "install wiring" call without carrying a per-harness placement policy plus the git-exclusion step, and the exclusion step has no equivalent in Hermes's worktree handling today — Hermes creates the worktree via `git worktree add` and knows nothing about excluding paths within it.
