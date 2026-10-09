import type { SessionMessage } from 'claude-code'

const TRANSCRIPT_CHARS = 360_000
const HEAD_SHARE = 0.2

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)} [...]` : text)

/** The transcript as plain text, each part capped, the middle dropped when it is still too long. */
export function renderTranscript(messages: readonly SessionMessage[], budget = TRANSCRIPT_CHARS): string {
  const parts = messages.map(m => {
    const lines = [m.text.trim() ? `${m.role.toUpperCase()}: ${clip(m.text.trim(), m.role === 'user' ? 6000 : 4000)}` : '']
    for (const use of m.toolUses) {
      lines.push(`TOOL ${use.tool}: ${clip(JSON.stringify(use.input ?? {}), 600)}`)
      if (use.text) lines.push(`${use.isError ? 'ERROR' : 'RESULT'}: ${clip(use.text, use.isError ? 1500 : 600)}`)
    }
    for (const result of m.toolResults ?? []) {
      if (result.text) lines.push(`${result.isError ? 'ERROR' : 'RESULT'}: ${clip(result.text, result.isError ? 1500 : 600)}`)
    }
    return lines.filter(Boolean).join('\n')
  })
  const whole = parts.filter(Boolean).join('\n\n')
  if (whole.length <= budget) return whole
  const head = Math.floor(budget * HEAD_SHARE)
  const tail = budget - head
  return `${whole.slice(0, head)}\n\n[... ${whole.length - budget} characters omitted ...]\n\n${whole.slice(-tail)}`
}

export const COMPACT_SECTIONS = [
  '## User requests',
  '## Decisions',
  '## Files',
  '## Errors',
  '## Outstanding work',
  '## Recent code',
] as const

export const COMPACT_SYSTEM = [
  'You compact a coding session so it can continue with less context. Write a faithful, specific summary; never invent anything.',
  `Use exactly these headings, in order: ${COMPACT_SECTIONS.join(', ')}.`,
  'Keep every user request and constraint, every decision and why, each file path touched and how, each error and whether it was fixed, all unfinished work, and the most recent code verbatim in fenced blocks.',
  'Write "None." under a heading with nothing to keep.',
].join('\n')

export const compactPrompt = (transcript: string, instructions?: string) =>
  `${instructions?.trim() ? `Also keep or stress: ${instructions.trim()}\n\n` : ''}Transcript:\n${transcript}`

export const isUsableSummary = (text: string) =>
  text.trim().length >= 200 && COMPACT_SECTIONS.every(heading => text.includes(heading))

export const summaryMessage = (summary: string): SessionMessage => ({
  role: 'user',
  text: `This session continues from an earlier conversation. Haiku 5.5 summarized it for lif-effort:\n\n${summary.trim()}\n\nContinue from where it left off without asking the user to repeat anything.`,
  toolUses: [],
})

export const HANDOFF_SECTIONS = ['## Goal', '## Done', '## Decisions', '## Files', '## Open issues', '## Next step'] as const

export const handoffPrompt = (repoState: string) =>
  [
    'Write a handoff document so a fresh session can continue this work with no other context.',
    `Start with "# Handoff", then use exactly these headings: ${HANDOFF_SECTIONS.join(', ')}.`,
    'Be specific: file paths, commands, error text, and what was decided and why. Under "## Next step" state the single task the next session should do first, as an instruction.',
    'Reply with the document only.',
    repoState ? `\nRepository state (read-only):\n${repoState}` : '',
  ].join('\n')

export const isUsableHandoff = (text: string) => text.trim().length >= 100 && text.includes('## Next step')

/** The task the next session carries on with: what gets classified, not the summary-writing request. */
export function carriedTask(handoff: string): string {
  const match = /## Next step\s*\n([\s\S]*?)(?=\n## |\s*$)/.exec(handoff)
  const task = match?.[1]?.trim()
  return (task || handoff).slice(0, 2000)
}

export const REVIEW_SECTIONS = ['## Verdict', '## Clarity', '## Actionability', '## Fidelity', '## Efficiency', '## Security', '## Do next time'] as const

export const reviewPrompt = (focus?: string) =>
  [
    'Review how well this session gave the agent its context, using the CAFE(S) framework. Judge the session as it happened; never invent events.',
    `Start with "# Session review", then use exactly these headings: ${REVIEW_SECTIONS.join(', ')}.`,
    'Under "## Verdict" write two sentences: how the session went and its biggest context gap.',
    'For each CAFE(S) heading give a rating (good, mixed or weak), then evidence from this session: a quoted prompt, a file, a retry, a correction. If there is no evidence, write "No evidence."',
    'Clarity: did the agent read each request as meant, or pick one of several readings? Actionability: were the goal, limits and finish line stated, and did the work run on or expand without a stop? Fidelity: did the agent act on stale, wrong or unverified facts? Efficiency: was context scoped to the task, or was there too much, too little, or rules in the wrong place? Security: did secrets, untrusted text or too-wide tool access reach the agent?',
    'Under "## Do next time" list at most five actions, each starting with a verb, each naming the exact prompt wording, file or setting to change, and tagged with the CAFE(S) letter it fixes. Put the highest-impact action first.',
    focus?.trim() ? `Also weigh this: ${focus.trim()}` : '',
    'Reply with the document only.',
  ]
    .filter(Boolean)
    .join('\n')

export const isUsableReview = (text: string) => text.trim().length >= 200 && text.includes('## Do next time')

export const continuationPrompt = (file: string) =>
  `Continue the work described in ${file}. Read it first, then start with its "Next step".`

/** HANDOFF-20261010-142501.md: a second handoff never replaces the first silently. */
export function datedHandoffName(ms: number): string {
  const d = new Date(ms)
  const two = (n: number) => String(n).padStart(2, '0')
  return `HANDOFF-${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}.md`
}
