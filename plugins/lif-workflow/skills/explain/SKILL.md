---
name: explain
description: >
  Use when the user runs /explain <topic|code|file|concept> or asks to
  "explain this plainly", "explain in STE", or "make this readable". Writes a
  structured, layered explanation in ASD-STE100 Simplified Technical English:
  short sentences, approved words, one topic per paragraph, overview first,
  detail below.
---

# Explain

Produce a layered explanation of the given subject in ASD-STE100 style.
Not a summary: the reader must leave with a correct working model.

## Input

`/explain <subject>` where subject is a topic, a concept, a file path, a code
selection, a command, an error, or a pasted text. If the subject is in the
repo, read it before you write. If no subject is given, explain the most recent
thing discussed in the conversation.

Optional suffix: `--depth 1|2|3` (default 3). Depth 1 writes only Layer 1.
Depth 2 writes Layers 1 and 2. Depth 3 writes all three.

## Output structure (layered)

Each layer stands alone. A reader can stop after any layer and have a true
picture at that resolution.

### Layer 1: What it is

One paragraph, max 4 sentences. Answer: what is this, what does it do, why
does it exist. No internals.

### Layer 2: How it works

Headed sections, one topic each. Typical topics: parts, flow, inputs and
outputs, rules it follows, what controls it. Use a vertical list when there
are three or more items. Use a plain-text diagram in a code block when the
subject is a flow or a chain.

### Layer 3: Details and limits

Headed sections. Edge cases, failure modes, limits, numbers, config, how to
check it, where it lives. Safety-relevant facts use the STE pattern:
`WARNING:` for risk of injury or data loss, `CAUTION:` for risk of damage,
each followed by the command then the risk.

Close with **Terms**: a two-column table of each technical name you used and
its meaning in one sentence. Only when Layer 2 or 3 was written.

## Writing rules (ASD-STE100, Part 1)

Apply these to every sentence.

**Sentences**
- Procedural sentence (an instruction): max 20 words.
- Descriptive sentence: max 25 words.
- Paragraph: max 6 sentences, one topic.
- One instruction per sentence, unless the actions are simultaneous.
- Keep "the", "a", "this". Do not drop articles.

**Verbs**
- Instructions use the command form: "Close the valve." Not "The valve should
  be closed."
- Approved tenses: simple present, simple past, simple future, infinitive,
  past participle as adjective. Not approved: -ing progressive, perfect
  ("has closed"), passive in instructions.
- Active voice in procedures. Passive in description only when the actor is
  unknown or irrelevant.

**Words**
- One word, one meaning, one part of speech. Use the same word for the same
  thing every time. Do not vary for style.
- Prefer the approved word. Common swaps:

  | Not approved | Use |
  |---|---|
  | utilize | use |
  | commence | start |
  | ensure | make sure that |
  | prior to | before |
  | subsequent to | after |
  | in order to | to |
  | approximately | about |
  | replenish | fill |
  | terminate | stop |
  | facilitate | help, make easier |
  | implement | do, install, make |
  | perform | do |
  | obtain | get |
  | require | need |
  | indicate | show |
  | verify | make sure, check |
  | sufficient | enough |
  | additional | more |
  | numerous | many |
  | regarding | about |

- Noun clusters: max 3 words. "hydraulic reservoir pressure" is fine;
  "main engine oil pressure sensor bracket" is not. Break it with "of" or a
  second sentence.
- Technical names (product names, identifiers, paths, commands, error text)
  are exempt from the dictionary. Write them exactly as they are, in
  backticks. Do not translate them.
- No idioms, no metaphors, no humor, no hedging ("sort of", "basically").
- Numbers as digits. Units after the number.

**Layout**
- Vertical lists for sequences and sets of 3 or more.
- Numbered list for ordered steps. Bulleted list for unordered items.
- A table when 3 or more items share the same 2 or 3 fields.
- Headings are nouns or noun phrases, not sentences.

## Steps

1. Read the subject. If it is code or a file, trace it enough to describe the
   real behavior, not the intended behavior.
2. Draft Layer 1. Check it answers what, does, why in 4 sentences or fewer.
3. Draft Layer 2, then Layer 3 per `--depth`.
4. Pass over every sentence with the Writing rules. Count words in any
   sentence that looks long. Replace unapproved words from the table.
5. Build the Terms table from the technical names you used.
6. Deliver the explanation as the reply. Do not write a file unless the user
   asked for one; if they did, write Markdown and name the path.

## Softening

If the user asks for "80% STE" or "lighter", keep the sentence limits, the
command form, and the one-meaning rule. Relax the word table: allow common
unapproved words when the approved word reads oddly in the domain.
