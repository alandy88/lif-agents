---
name: morning-briefing
disable-model-invocation: true
description: "Use when the user says \"morning briefing\", \"triage inbox\", \"check email\", \"evening briefing\", \"what happened today\", or \"end of day\"."
---

# Morning Briefing

## Workflow

### Morning Briefing (full)

1. **Calendar** -- Fetch today's and tomorrow's events (see CLAUDE.md for DST offset calculation):

```bash
gws calendar events list --params '{"calendarId":"primary","timeMin":"{today}T00:00:00{offset}","timeMax":"{tomorrow+1}T00:00:00{offset}","singleEvents":true,"orderBy":"startTime"}'
```

2. **State scan** -- Read the last 7 daily notes to build continuity state. For each file `daily/YYYY-MM-DD.md` within the past 7 days:

```bash
obsidian read file="YYYY-MM-DD"
```

Parse all lines containing `<!-- gmail:` to extract:
- **actioned_ids** (Set): Gmail message IDs from lines matching `- [x]` (checked checkbox). Collect from ALL 7 days.
- **pending_items** (List): Gmail message IDs + full line text from lines matching `- [ ]` (unchecked checkbox). Collect from the LATEST note only (today's own note if re-running, otherwise most recent).

For each pending item, record:
- `gmail_id`: extracted from `<!-- gmail:ID -->`
- `tier`: which section heading it appeared under (Tier 1/2/3, Invoices, Follow-ups)
- `line_text`: the full markdown line (for carry-forward rendering)

If no daily notes exist in the 7-day window, set both to empty (fresh start -- skip to step 3 with no filtering).

**Gmail sync:** For each ID in actioned_ids, mark as read in Gmail:

```bash
gws gmail users messages modify --params '{"userId":"me","id":"{id}"}' --json '{"removeLabelIds":["UNREAD"]}'
```

This keeps Gmail in sync with vault state -- checked items no longer show as unread.

3. **Email triage + merge** -- Get unread inbox messages:

```bash
gws gmail users messages list --params '{"userId":"me","q":"is:unread is:inbox","maxResults":50}'
```

For each message, fetch metadata (the response includes `labelIds` for tier classification):

```bash
gws gmail users messages get --params '{"userId":"me","id":"{id}","format":"metadata","metadataHeaders":["From","Subject","Date"]}'
```

**MERGE with scanned state (from step 2):**

For each Gmail message:
- If `id` is in **actioned_ids** → **skip entirely** (already handled in a previous briefing)
- If `id` is in **pending_items** → **carry forward**: use the stored `line_text` and `tier`. Check if the thread has newer messages since the pending item was last seen -- if yes, prefix with 🔄 and fetch the updated body for a refreshed summary. If no new replies, carry forward the line unchanged.
- If `id` is NOT in either set → **new email**: classify into tiers using the rules in [references/tier-classification.md](references/tier-classification.md). Mark with `(NEW)` suffix.

For each item in **pending_items** whose `gmail_id` is NOT in the Gmail inbox results → **drop it** (email was archived or removed externally, no longer needs attention).

For Tier 1, Tier 2, and new Tier 3 messages, fetch the full body:

```bash
gws gmail users messages get --params '{"userId":"me","id":"{id}","format":"full"}'
```

Write a 1-2 sentence summary for each new email. Flag overdue items explicitly (e.g., "**OVERDUE -- action needed**").

4. **Follow-ups** -- Find follow-up items from today's note under `## Follow-ups Due`:

```bash
obsidian read file="YYYY-MM-DD"
```

Parse unchecked follow-up items (`- [ ] ... <!-- gmail:ID -->`). Filter for items where `due` <= today. Carried-forward follow-ups from step 2 are already included -- only add NEW follow-ups not yet in the note.

5. **Invoice scan** -- Search for recent emails matching:

```bash
gws gmail users messages list --params '{"userId":"me","q":"subject:(invoice OR bill OR payment OR \"request for payment\" OR overdue OR renewal) newer_than:7d","maxResults":20}'
```

For each result, fetch metadata:

```bash
gws gmail users messages get --params '{"userId":"me","id":"{id}","format":"metadata","metadataHeaders":["From","Subject","Date"]}'
```

**MERGE with scanned state:** Apply the same actioned_ids / pending_items logic as email triage:
- If `id` in actioned_ids → skip (already paid/dismissed)
- If `id` in pending_items with tier=Invoices → carry forward unchanged
- If new → extract amount and due date from subject/body, mark (NEW)

Flag any NOT from known auto-pay providers (see [references/tier-classification.md](references/tier-classification.md#known-auto-pay-providers-skip-in-invoice-scan)).

Output format: `- [ ] **Provider** — $amount due DATE <!-- gmail:ID -->`.

6. **Generate** `daily/YYYY-MM-DD.md` using the daily-briefing template. Fill in ALL sections -- including "Invoices / Payments" and "Follow-ups Due". Replace `{{date}}` placeholders.

**Email triage line format** (Tier 1, 2, 3):
```
- [ ] **Subject** — sender — 1-2 sentence summary <!-- gmail:MESSAGE_ID -->
```

Markers (prepend/append to the line text, not inside the checkbox):
- `🔄` before subject bold — carried forward item whose thread has new replies since last seen
- `(NEW)` after summary — first time this email appears in any briefing
- No marker — carried forward, unchanged from previous briefing

**Rendering order within each tier:** carried-forward items first (existing backlog), then new items (fresh arrivals).

**Invoice line format:**
```
- [ ] **Provider** — $amount due DATE <!-- gmail:MESSAGE_ID -->
```

**Follow-up line format:**
```
- [ ] Subject — from — due DATE <!-- gmail:MESSAGE_ID -->
```

**Tier 4** — count only, no gmail IDs needed (same as current behavior).

Write via obsidian-cli (not Write tool -- vault guard blocks direct file access):

```bash
obsidian create name="YYYY-MM-DD" path="daily/YYYY-MM-DD.md" content="<full briefing content>" silent overwrite
```

**Re-run behavior:** When overwriting today's existing note, preserve any content the user added manually (Log entries, Wins, Notes, Priority List items). Read existing note first, extract user-added content from those sections, and merge it into the new output.

7. **Print** terminal summary: event count, email count by tier (new vs carried-forward), follow-ups due, invoices needing attention.

### Evening Briefing

Focus on recap and tomorrow prep rather than triage:

1. **Today's calendar** -- list events that already happened (for journaling context)
2. **Tomorrow's calendar** -- full detail on tomorrow's events, prep reminders
3. **Email status** -- Read today's `daily/YYYY-MM-DD.md`. Count:
   - Checked items (`- [x]`) = actioned today
   - Unchecked items (`- [ ]`) = still pending
   Report: "X actioned, Y still pending". List any unchecked Tier 1 items by name as "**Tier 1 still unactioned:**".
4. **Follow-ups due tomorrow** -- scan today's note `## Follow-ups Due` for unchecked items with `due` = tomorrow
5. **Append** to existing `daily/YYYY-MM-DD.md` under a `## Evening Update` section (do NOT overwrite morning content). If no morning briefing exists, generate the full briefing first (step 6 above). Use obsidian-cli -- vault guard blocks direct Edit/Write:

```bash
obsidian append file="YYYY-MM-DD" content="## Evening Update\n\n<content>"
```
6. **Print** terminal summary: events completed, events tomorrow, actioned count, pending count, follow-ups due

### Triage Inbox (quick mode)

Same as step 3 of morning briefing (email triage + merge), but output to terminal only (no file generated). If no previous daily notes exist, performs a fresh triage with no state filtering.
