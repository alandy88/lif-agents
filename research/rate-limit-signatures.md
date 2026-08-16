# Research: per-harness rate-limit signatures for Claude Code and Pi

Resolves issue #33. Read-only research; no fm-* spawn/close/focus/send commands were run.

Sources: Firstmate repo `/Users/firstmate/firstmate` (peter-macmini); Hermes source at tag
`v2026.8.13` (= version 0.20.1, matching the live install).

## Headline: the ticket's premise needs revising

The ticket asks for "concrete detection signatures per harness … as they appear in pane
output". **Neither Firstmate nor Hermes detects rate limits by scraping pane output.**
Both use structured signals, and copying that is strictly better than inventing regexes.

A repo-wide search of `bin/` and `.agents/` for output patterns
(`limit reached`, `usage limit`, `out of credit|quota`, `upgrade to`, `try again later`,
`resets? at|in`, `429`, `too many requests`) returned **zero matches** in Firstmate.

## How Firstmate handles quota walls

Two mechanisms, both structured:

### 1. Preventive — `quota-axi` at dispatch time

Firstmate never waits to hit a wall. At intake it runs `quota-axi --json` once and resolves a
dispatch profile array using the `.agents/skills/quota-array-dispatch/SKILL.md` procedure,
reading `effectivePercentRemaining`, `usableRunwaySeconds`, `projectedExhaustedAt`,
`limitingWindowId`, `projectionConfidence` and the vendor's own bounding rule from
`quotaSemantics.description`. `quota-axi` is explicitly data-only: it
"never recommends, selects, ranks, or infers a route."

`bin/fm-quota-axi-lib.sh` pins a compatibility floor (`FM_QUOTA_AXI_MIN=0.1.25`) enforced by
`fm-bootstrap.sh`; `quota-axi` is a required bootstrap tool.

### 2. Reactive — the worker self-declares `paused:`

`bin/fm-classify-lib.sh` defines `FM_CLASSIFY_PAUSED_VERB_DEFAULT='paused'`. A crew appends
`paused: <reason>` to its status file to declare it is intentionally idling on a **known**
external dependency — the header names "a vendor rate-limit reset" as the canonical example.

Consequences, per that library's own contract:

* A `paused:` pane is **expected** to be idle, so the stale path **absorbs** it instead of
  escalating a possible wedge.
* It is deliberately **not** captain-relevant: a pause is a "stop wedge-nagging this idle
  pane" signal, not work to keep surfacing.
* `FM_PAUSE_RESURFACE_SECS_DEFAULT=3600` re-surfaces it once an hour so a forgotten hold
  cannot rot invisibly.

So the *harness itself* reports the throttle. Firstmate infers nothing from rendered text.

## How Hermes handles it — the mechanism we lose

The sentinel is an **exit code**, not a pattern:

```python
KANBAN_RATE_LIMIT_EXIT_CODE = 75
DEFAULT_RATE_LIMIT_COOLDOWN_SECONDS = 300   # env: HERMES_KANBAN_RATE_LIMIT_COOLDOWN_SECONDS
```

`_classify_worker_exit(pid)` maps `WIFEXITED` with status 75 to `("rate_limited", 75)`.
Inside `detect_crashed_workers` the requeue is a **clean release, not a crash**:

```sql
UPDATE tasks SET status = ?, claim_lock = NULL, claim_expires = NULL, worker_pid = NULL
 WHERE id = ? AND status = 'running' AND worker_pid = ? AND claim_lock IS ?
```

then `_end_run(outcome="rate_limited", status="rate_limited")` so board history shows no
phantom crash, and:

```python
# WITHOUT touching consecutive_failures (that's the whole point:
# no breaker trip on a throttle).
conn.execute("UPDATE tasks SET last_failure_error = ? WHERE id = ?", ...)
```

`check_respawn_guard` then gates the respawn on the **latest** run only: while
`outcome == 'rate_limited'` and `now - ended_at < cooldown` it returns `"rate_limit_cooldown"`
(defer); once elapsed it returns `None` and **retries forever, cheaply, spaced by the
cooldown**, until quota returns or a real crash/completion supersedes it. It deliberately runs
*before* the `_RESPAWN_BLOCKER_RE` auth/quota regex check, because the stamped quota-flavored
`last_failure_error` would otherwise match and defer forever — with no failure increment, the
breaker could never free it.

`_protocol_violation_streak` also treats `rate_limited` runs as **neutral and skipped**:
"a quota wall says nothing about the task."

## The honest gap

I cannot supply verified pane-output strings for Claude Code or Pi rate limits. There are
none recorded anywhere in Firstmate (no captured samples in `docs/verification/`), and
obtaining them means either hitting a real quota wall or trusting memory — both bad inputs to
a spec. **Inventing plausible-looking patterns here would be the worst outcome**: a wrong
regex silently mis-classifies a real failure as a throttle and retries it forever.

Note too that exit code 75 is a *Hermes worker convention*, not something Claude Code or Pi
emit. Nothing upstream produces it for us.

## Recommendation: reconstruct the exit code, do not scrape

We control the pane's command line, so we can preserve exit-code semantics rather than
replace them with pattern matching:

1. Wrap the harness in the pane with a small shell that captures the harness's real exit
   status and writes it to a marker file keyed by the gen token — the same shape as
   Firstmate's existing turn-end marker, which already proves this pattern works over a
   non-child process.
2. The tick reads that marker and feeds the equivalent of `_classify_worker_exit`, so
   `rate_limited` / `clean_exit` / `nonzero_exit` all survive the non-child boundary. This
   recovers more than rate limiting — it also restores the protocol-violation detection noted
   as lost elsewhere on the map.
3. Adopt Firstmate's `paused:` self-declaration as the *primary* signal: instruct the harness
   in its brief to declare a throttle explicitly. Structured and version-proof.
4. Adopt the preventive layer if `quota-axi` is available to the plugin — choosing a profile
   with headroom beats reacting to exhaustion.
5. Only if 1–3 prove insufficient, capture real signatures deliberately: run a throwaway task
   against a deliberately exhausted cheap account, record the pane tail verbatim, and treat
   the pattern as a **last-resort** classifier that can only ever *add* a `paused` verdict,
   never override a structured one.

## Open follow-up for the map

The wrapper in (1) is a small addition to the spawn path and it also fixes the
protocol-violation gap. It may deserve its own decision ticket rather than being folded into
the vendoring boundary.
