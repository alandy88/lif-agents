# Dependency closure: Firstmate Herdr transport and busy-state

Research resolving issue #32. Read-only survey of `/Users/firstmate/firstmate` on peter-macmini. No fm-* command that spawns, closes, focuses or sends input was run.

## 1. Raw line counts (starting set)

| File | Lines |
|---|---|
| `bin/backends/herdr.sh` | 3344 |
| `bin/fm-composer-lib.sh` | 1393 |
| `bin/fm-busy-lib.sh` | 986 |
| `bin/fm-backend.sh` | 981 |
| `bin/fm-busy-event.sh` | 217 |
| `bin/backends/herdr-eventwait.py` | 157 |
| `bin/backends/herdr-workspace-move.py` | 114 |
| `bin/fm-transition-lib.sh` | 103 |
| **Subtotal** | **7295** |
| `bin/fm-wake-lib.sh` (transitive) | 1283 |
| **True closure** | **8578** |

The ticket estimated `herdr.sh` at a size consistent with `fm-backend.sh`; it is in fact **3344 lines**, the largest single file in the set.

## 2. Transitive source closure

The `source`/`.` graph is shallow — four edges total:

- `bin/backends/herdr.sh:79` → `bin/fm-composer-lib.sh`
- `bin/backends/herdr.sh:87` → `bin/fm-transition-lib.sh`
- `bin/backends/herdr.sh:2866` → `bin/fm-wake-lib.sh` (**lazy, conditional** — see §5)
- `bin/fm-busy-event.sh:50` → `bin/fm-busy-lib.sh`
- `bin/fm-backend.sh:602-630` → `backends/{tmux,herdr,zellij,orca,cmux}.sh` (lazy, one arm per backend)

`fm-busy-lib.sh`, `fm-composer-lib.sh` and `fm-transition-lib.sh` are **leaves** — they source nothing.

One non-source (runtime) edge matters: `fm-busy-lib.sh:944-947` documents that `fm_busy_classify_live` "Requires fm-backend.sh to be sourced for `fm_backend_target_exists`". See §6.

## 3. Firstmate `state/` coupling: effectively zero

This is the most favourable finding. **None** of `herdr.sh`, `fm-busy-lib.sh`, `fm-busy-event.sh`, `fm-composer-lib.sh`, `fm-transition-lib.sh` hardcodes a path into Firstmate's `state/` store. Every state-touching function takes `<state-dir>` as its **first argument**:

```
fm_busy_record_path()  { printf '%s/%s.busy-state' "$1" "$2"; }   # :149
fm_busy_gen_path()     { printf '%s/%s.busy-gen'   "$1" "$2"; }   # :153
fm_busy_current_gen()   # <state-dir> <id>                          :168
fm_busy_record_read()   # <state-dir> <id>                          :220
fm_backend_herdr_escalation_marker()  # <state_dir> <window>        :3172
fm_backend_herdr_apply_transition()   # <state_dir> <session> <record>  :3187
fm_backend_herdr_wait_transition()    # <session> <timeout> <state_dir> <panes...>  :3233
```

Porting cost for state layout is therefore **one decision** (where our state dir lives), not a rewrite. The gen-token stale-incarnation rejection and the record format are entirely parameterised.

## 4. Config coupling: env vars with defaults, no config files

`FM_*` surface per file:

- `fm-transition-lib.sh` — 1 var (`FM_TRANSITION_FIELD_SEP`). Trivially portable.
- `fm-busy-lib.sh` — 4 vars, all harness regex/version tables.
- `fm-composer-lib.sh` — ~40 vars, but they are *all* scanner tuning and per-harness busy regexes (`FM_DELIVERY_{CLAUDE,PI,CODEX,...}_BUSY_REGEX_DEFAULT`), each with an in-file default.
- `herdr.sh` — ~52 vars, all self-configuration (protocol floors, poll budgets, journal keys, session/pane identity). `FM_ROOT`, `FM_HOME`, `FM_BACKEND_HERDR_ROOT` are the only ones that assume a Firstmate install layout; all three are directory anchors we set ourselves.

No file reads a Firstmate config file. There is no config-inheritance entanglement in this set.

## 5. What is Herdr-specific vs droppable

### 5a. `herdr.sh` — presentation/projection is ~45% of the file

Function inventory splits cleanly into two halves:

**Core transport (keep)** — `cli`, `tool_check`, `version_check`, `session`, `server_ensure`, `parse_target`, `target_ready`, `current_path`, `send_text_line`, `send_literal`, `normalize_key`, `send_key`, `capture`, `capture_ansi`, `agent_identity_raw`, `composer_identity`, `composer_state`, `rendered_busy_state`, `send_text_submit`, `submit_confirm_budget`, `wait_for_working`, `kill`, `kill_serialized`, `endpoint_confirmed_gone`, `classify_agent_status`, `classify_submit_agent_status`, `agent_status_raw`, `agent_state`, `agent_alive`, `pane_agent_state`, `pane_presence_state`, `workspace_presence_state`, `explicit_close_pane_confirmed`, `tab_is_husk`, `pane_for_tab`, `resolve_bare_selector`, `list_live`, `socket_path`, `events_capable`, `normalize_event`, `event_reader_cmd`, `escalation_marker`, `apply_transition`, `commit_transition`, `clear_transition`, `wait_transition`, `workspace_find`, `workspace_find_all`, `workspace_ensure`, `container_ensure`, `create_task`, `launcher_identity`, `version_at_least`, `pid_is_bare_shell`, `pane_idle_shell_pid`, `pane_idle_shell_sample`, `death_close_pane`.

**Presentation / projection / secondmate (drop)** — `presentation_preference` (:160), `release_floor_verdict` (:206), `presentation_release_supported` (:231), `presentation_floor_warn` (:283), `presentation_default_supported` (:311), `presentation_enabled` (:327), `projection_id` (:428), the ten `projection_journal_*` functions (:441-:632), `projection_workspace_label` (:648), the four `presentation_lock_namespace*` functions (:658-:678), `canonical_socket_path` (:699), `presentation_session_socket_path` (:716), `presentation_session_lock_path` (:731), `projection_focus_snapshot` (:760), `projection_focus_restore` (:795), `projection_close_pane_focus_preserving` (:840), `workspace_move_capable` (:964), `emptying_close_plan` (:996), `emptying_move_rollback` (:1093), `projection_order_best_effort` (:1278), `workspace_prune_seeded_default_tab` (:1668), `projection_create_task` (:2065), and `projection_{cleanup_exact,parent_workspace_exact,live_binding_matches,reclaim_rollback,reclaim_task,recovery_allows_flat,endpoint_matches_journal}` (:2178-:2503).

Grep density confirms the scale: `presentation` 140 hits, `projection` 135, `journal` 81, `secondmate` 15.

**Dropping this is a supported configuration, not a hack.** `fm_backend_herdr_presentation_enabled` (:327) is a tri-state gate reading `off`/`on`/auto-detect; `off` is a first-class value. Our design creates a dedicated `hermes` session and its own tabs, so per-task disposable presentation spaces are dead weight.

**Two dependencies fall out with it:**

1. `bin/fm-wake-lib.sh` (1283 lines). The only edge is `herdr.sh:2861-2868`, inside `fm_backend_herdr_kill`, which sources it *only if* `fm_backend_herdr_presentation_session_lock_path` succeeds — needed solely to `fm_lock_try_acquire` a presentation-ordering lock. With presentation off, that call returns 1 at :733 and wake-lib is never sourced.
2. `bin/backends/herdr-workspace-move.py` (114 lines), reached only via `workspace_move_capable`/`emptying_close_plan`.

### 5b. `fm-busy-lib.sh` — harness tables dominate

Case-insensitive mention counts: `muse` 74, `cursor` 33, `codex` 29, `kimi` 19, `grok` 18, `claude` 6, `pi` 6, `opencode` 2. The muse block alone (`fm_busy_muse_*`, :299-:628) is ~330 lines of session-log parsing for a harness out of scope; `fm_busy_cursor_*` (:630+) adds more. Claude and Pi need only the record/gen/source-trust core (:111-:298) plus `fm_busy_sources_for_harness` and `fm_busy_source_trusted`.

Note `fm_busy_codex_appserver_observable` (:124), `fm_busy_codex_hooks_verified` (:138) and `fm_busy_codex_semantic_source` (:145) encode the Codex-unobservable finding directly. Codex is out of scope for the map, but these three are cheap and worth keeping as documentation of the refusal.

### 5c. `fm-composer-lib.sh` — Pi is the expensive harness

Mentions: `pi` 87, `cursor` 51, `claude` 11, `opencode` 9, `grok` 9, `codex` 8, `kimi` 6, `muse` 5. Pi's composer needs a dedicated paired-delimiter scanner (`FM_COMPOSER_SCAN_PI_{OPEN,CLOSE,PAIR_FOUND,PAIR_VALID,LAST_SEPARATOR}`, `FM_COMPOSER_PI_MAX_LINES`). Since Pi is in scope, that stays. The cursor block is the largest droppable chunk.

The file's own comment (:287-:291) states the boundary we must preserve: this is a **delivery guard, deliberately not a worker-state source** — the semantic busy contract is owned by `fm-busy-lib.sh`, "which forbids classifying a harness from rendered text."

### 5d. `fm-backend.sh` — do not vendor

981 lines whose entire job is dispatching a backend-neutral contract across five backends (`tmux herdr zellij orca cmux`). We have exactly one backend. The ~14-function contract (`fm_backend_capture`, `send_key`, `send_text_submit`, `kill`, `busy_state`, `composer_state`, `target_exists`, `agent_state`, `agent_alive`, `has_push`, `events_capable`, `wait_transition`, `commit_transition`, `clear_transition`) becomes the plugin's Python-side interface. Reimplement, do not port.

## 6. Recommended minimal cut

| Component | Lines vendored | Of |
|---|---|---|
| `herdr.sh` core transport subset | ~1750 | 3344 |
| `fm-composer-lib.sh` (drop cursor/muse/kimi/grok/opencode) | ~900 | 1393 |
| `fm-busy-lib.sh` (drop muse/cursor/kimi/grok) | ~450 | 986 |
| `fm-busy-event.sh` (whole) | 217 | 217 |
| `herdr-eventwait.py` (whole) | 157 | 157 |
| `fm-transition-lib.sh` (whole) | 103 | 103 |
| **Total vendored** | **~3577** | of 8578 closure |

Dropped entirely: `fm-backend.sh` (981, reimplemented in Python), `fm-wake-lib.sh` (1283, falls out with presentation), `herdr-workspace-move.py` (114, likewise).

### What each omission costs

- **Presentation/projection** — no per-task disposable presentation spaces, no focus-preserving pane close, no workspace reordering, no journal-based endpoint reclaim after a tab/pane is replaced. We give up Firstmate's crash-recovery path that rebinds a task to a moved pane. Our equivalent is Hermes's `task_runs.metadata` binding plus the gen token; that substitution needs stating in the spec, not assuming.
- **`fm-wake-lib.sh`** — no `fm_lock_try_acquire`. If the plugin ever needs cross-process locking around session mutation, it must supply its own (Python `fcntl` is fine, and better than porting 1283 lines of bash).
- **`fm-backend.sh`** — loses the backend-neutral seam. Acceptable: adding a second backend later means implementing the same 14-function interface in Python, which is the seam anyway.
- **Non-Claude/Pi harness tables** — re-adding a harness later means re-vendoring its regex block and, for the busy layer, its trusted-source entry. Cheap and additive.

## 7. Biggest entanglement risk

**`fm_busy_classify_live` crosses the transport boundary.** `fm-busy-lib.sh:944-947` states it "Requires `fm-backend.sh` to be sourced for `fm_backend_target_exists`", implementing the precedence rule that a gone endpoint is **dead, never busy** — the top of the classification ladder.

If we vendor `fm-busy-lib.sh` as bash but reimplement the backend contract in Python (§5d), that call has no callee. The failure is silent and bad: the dead-endpoint override stops firing, and a task whose pane has vanished classifies from its stale record instead of as dead. Given the never-trust-native-idle rule, a stale `busy` record would keep a dead task looking alive indefinitely.

The vendoring-boundary ticket (#36) must decide this explicitly. Options: (a) shim `fm_backend_target_exists` in bash calling back into the plugin, (b) hoist `fm_busy_classify_live` itself into Python and keep only the pure record/gen parsing in bash, or (c) pass a liveness verdict in as an argument, keeping the bash side pure. (c) preserves the existing parameterisation style of the whole library and is the smallest change.

## 8. Permissions

Nothing was unreadable. All files were readable as `peteryu` without `sudo`; `git -c safe.directory='*'` was not needed for plain reads.
