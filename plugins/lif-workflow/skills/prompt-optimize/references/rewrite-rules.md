# Rewrite rules

Distilled from Anthropic's "Prompting Claude Opus 5.5" guide, with the Opus 5 guide and
the general prompting best practices it builds on. Only prompt-level rules live here;
API settings such as `max_tokens`, `thinking.display`, and refusal handling are out of
scope for a brief.

## Sections

Write the brief in this order. Use plain prose under short headings or XML tags
(`<goal>`, `<context>`, …); pick one style and keep it. When the brief carries a long
input (a log, a document, a diff), put that input first and the instructions after it.

1. **Goal** — one or two sentences: what to achieve and why it matters. The reason lets
   the model generalise to cases the brief does not list.
2. **Scope** — what is in, what is out, and what must stay untouched. Write the verb the
   user means: "Change this function" makes changes, "suggest changes" only suggests.
3. **Context** — exact paths, commands, test names, prior decisions, and what was already
   tried or ruled out. Facts the model cannot cheaply look up; leave out what one `ls` or
   one file read would show.
4. **Constraints** — each with its reason, phrased as the target behaviour. "Output is read
   by a text-to-speech engine, so write numbers as words" beats "NEVER use digits".
5. **Done when** — a checkable, exhaustive finish line: "all 14 call sites migrated and
   `bun test` green", not "migration complete". For work with several parts, list the
   parts so each can be ticked off.
6. **Report** — what the final message leads with (the outcome, then what the user must
   decide or do), and any artifact the work must produce, with its length matched to what
   the task needs.

## Strip

Opus 5.5 thinks on every turn, checks its own work, and follows instructions closely.
Each pattern below either adds cost for nothing or misfires. Remove it; where a
replacement is given, use that.

| Raw prompt says | Why it misfires | Replace with |
| --- | --- | --- |
| "think step by step", a hand-written reasoning plan, "think carefully before answering" | Thinking is always on and set by effort. A prescribed plan does worse than the model's own, and the reminder only adds latency. | Nothing. |
| "explain your reasoning", "show your work" in the reply | Pushing reasoning into the reply can be declined as reasoning extraction. | Ask for the conclusion and the evidence for it. |
| "double-check", "verify your answer", "use a subagent to verify" | The model already verifies; extra passes cause over-verification. | The Done-when line. |
| "CRITICAL", "MUST", "ALWAYS", capitals | Over-triggers on current models. | The same rule in normal words, with its reason. |
| "don't do X" as the only guidance | Names the unwanted behaviour without a target. | The behaviour you want; keep a ban only as a hard guardrail, paired with the target. |
| "be thorough", "if in doubt use tool X" | Current models already explore; this over-triggers tools. | A concrete bar: "every caller of `foo` accounted for". |
| "only report high-severity issues", "be conservative" in a review | Followed literally, so real findings go missing. | "Report every issue with a severity; I filter later." |
| "avoid a generic AI look" in frontend work | Swaps one default style for another. | Named styles to avoid (see Frontend below). |
| Vague adjectives: "clean", "robust", "improve" | No finish line. | The measurable property meant. |

## Conditional blocks

Add each block only when its condition holds. Adapt the wording to the task.

**Narrow task that could sprawl** (a bug fix, a targeted change):

> Deliver what was asked, at the scope intended. Make routine judgment calls yourself, and
> check in only when different readings of the request would lead to materially different
> work. If the request seems mistaken or a better approach exists, say so in a sentence
> and continue with the task as asked.

**Delegation possible** (the receiver can spawn subagents):

> Delegate only large, genuinely independent tracks, such as a wide multi-file
> investigation. Work you can finish in a handful of tool calls stays with you, and so
> does checking your own work.

**Several connected sources** (email, docs, sheets, tickets, several repos) where the
needed fact may sit somewhere the request does not name:

> Before taking any action, explore broadly: open the files, documents, and records that
> could bear on this task, including ones the task does not mention, and use what you find.

**Time matters, or several agents run in parallel:**

> Time matters here: do not spend time that can be avoided, and the earlier a correct
> result is obtained, the better.

A numeric budget works only when the harness reports elapsed time on every message
(`elapsed 340s / 1200s`); a brief alone cannot, so use the sentence above.

**Unattended run** (Codex, a background agent, a cron job — nobody is there to answer).
Leave this out whenever a human is in the loop.

> Keep working until the Done-when line holds. A message with no tool call ends the run,
> so put status notes and recommendations in the same message as your next tool call and
> carry on with whatever does not depend on an answer. Stop only when nothing can move
> without the user, or the blocker is deliberately protected from you. Risky or
> irreversible actions still need confirmation.

**Frontend without design direction** — name the defaults to avoid, then check the first
result and extend the list with whatever default it fell back on:

> Do not use a cream or off-white background, italic accent words in headlines, numbered
> "01/02/03" section labels, monospace labels, or pill-shaped buttons.

**Dense visual input** (technical drawings, packed charts): supply the highest-resolution
image available and ask the model to crop and zoom with the image tools before reading
values.

**Brief runs outside Claude Code** (an API call, or a subagent with its own model
setting): recommend `medium` effort, `low` for simple lookups, and `xhigh` or `max` only
where a quality gain was measured. Lower effort, not prompt text, is the lever for less
thinking.

## Example

Raw:

> the export is broken again can you look at it and make it better, be thorough and
> double check everything

Brief:

```text
<goal>
Fix the CSV export in `src/export/csv.ts`: rows with commas in a field come out split
across columns. Users import these files into Excel, so the output must follow RFC 4180
quoting.
</goal>

<scope>
Change the export code and its tests. The JSON export and the download route stay as
they are.
</scope>

<context>
`bun test src/export` runs the export tests. Issue #212 has a failing sample file.
</context>

<done_when>
A field containing a comma, a quote, or a newline round-trips through export and
re-import unchanged, with a test for each, and `bun test` is green.
</done_when>

<report>
Lead with the cause in one sentence, then the fix.
</report>
```

Changes, after reading the repo and issue #212: "make it better" narrowed to the reported bug; "be thorough" and "double check
everything" replaced by the Done-when line; paths and test command filled from the repo.
