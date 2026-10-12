import { expect, test, type Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { digestNote, isUsableReview, notesIndex, parseReflect, reflectPrompt, REVIEW_SECTIONS } from '../hooks/summaries'
import { BAND, command, start, usage, world } from './world'

const REVIEW = `# Session review
## Verdict
Mixed. The goal was never stated.
## Clarity
mixed. "fix it" had two readings.
## Actionability
weak. No finish line.
## Fidelity
good. No evidence of stale facts.
## Efficiency
good. No evidence.
## Security
good. No evidence.
## Do next time
1. State the finish line in the first prompt. (A)`

const lesson = (path: string, title: string, body: string) => `<lesson>\npath: ${path}\ntitle: ${title}\n\n${body}\n</lesson>`
const BUN = lesson('notes/terminal-setup.md', 'Bun is the only toolchain', '- CI installs no Node at all; `bun test` is the runner.')
const VAULT = lesson('notes/vault-lint.md', 'The vault lint runs with python3', '- `system/scripts/lint-vault.py`')
const REFLECTION = `${REVIEW}\n\n${BUN}\n\n${VAULT}`

const TITLES = 'notes/terminal-setup.md:# Terminal setup\nnotes/finance/tax.md:# Tax\n'
const OLD = '---\ntype: reference\nupdated: "2026-09-02"\nsensitivity: green\n---\n\n# Terminal setup\n\nupdated: by hand\n'

type Setup = { vault?: string; fork?: string | null; answers?: string[]; old?: string; lint?: string; redExit?: number }

function reflectWorld(on: On, setup: Setup = {}) {
  const w = world(on)
  const prompts: string[] = []
  const writes: { path: string; text: string }[] = []
  const ran: { argv: readonly string[]; cwd?: string }[] = []
  const asked: string[] = []
  const answers = [...(setup.answers ?? [])]
  on('env.get', (_$, e) => ({ value: e.name === 'LIF_NOTES_VAULT' ? setup.vault : '/home/me' }))
  on('process.run', (_$, e) => {
    ran.push({ argv: e.argv, cwd: e.init?.cwd })
    const isRed = e.argv.includes('-l')
    const stdout = e.argv[0] === 'python3' ? (setup.lint ?? '') : isRed ? 'notes/finance/tax.md\n' : TITLES
    return { value: { exitCode: isRed ? (setup.redExit ?? 0) : 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('model.fork', (_$, e) => {
    prompts.push(e.prompt)
    return { value: setup.fork === null ? { isAnswered: false, reason: 'nothing-to-fork' } : { isAnswered: true, text: setup.fork ?? REFLECTION, usage } }
  })
  on('fs.exists', (_$, e) => ({ value: setup.old !== undefined && e.path.endsWith('terminal-setup.md') }))
  on('fs.read', () => ({ value: setup.old ?? '' }))
  on('fs.write', (_$, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => {
    asked.push(e.questions[0]!.question)
    return { result: { questions: e.questions, answers: { [e.questions[0]!.question]: answers.shift() ?? 'Save' } } }
  })
  return { ...w, prompts, writes, ran, asked }
}

async function runReflect($: Engine, w: ReturnType<typeof reflectWorld>, args = 'reflect') {
  await start($)
  await $.command.run({ ...command, command: 'lif-effort', args })
  await w.clock.advance(1)
}

const OPTIONS = { options: { showStatus: false } }

test('a reflection prints the review, then asks about each lesson and writes only the saved ones', OPTIONS, async ($, on) => {
  const w = reflectWorld(on, { vault: '/vault', answers: ['Save', 'Skip'] })
  await runReflect($, w, 'reflect the bun toolchain')
  expect(w.prompts).toHaveLength(1)
  expect(w.prompts[0]).toContain('<vault_notes>\nnotes/terminal-setup.md:# Terminal setup\n</vault_notes>')
  expect(w.prompts[0]).toContain('Also weigh this, in the review and when picking lessons: the bun toolchain')
  expect(w.logs.slice(0, REVIEW.split('\n').length)).toEqual(REVIEW.split('\n'))
  expect(w.logs).toContain('Lesson for notes/terminal-setup.md (a new note): Bun is the only toolchain')
  expect(w.asked).toEqual(['Save this lesson to notes/terminal-setup.md in the vault?', 'Save this lesson to notes/vault-lint.md in the vault?'])
  expect(w.writes).toHaveLength(1)
  expect(w.writes[0]!.path).toBe('/vault/notes/terminal-setup.md')
  expect(w.writes[0]!.text).toMatch(/^---\ntype: reference\nupdated: "\d{4}-\d\d-\d\d"\nsensitivity: green\n---\n\n# Bun is the only toolchain\n\n- CI installs/)
  expect(w.ran.filter(r => r.argv[0] === 'git').every(r => r.cwd === '/vault' && r.argv[1] === 'grep')).toBe(true)
  expect(w.toasts).toContain('lif-effort: saved 1 of 2 lessons; nothing is committed')
})

test('a lesson for a note that exists keeps its text, adds the entry at the end, and shows that note\'s lint lines', OPTIONS, async ($, on) => {
  const w = reflectWorld(on, { vault: '/vault', fork: `${REVIEW}\n${BUN}`, old: OLD, lint: 'notes/other.md: [x] no\nnotes/terminal-setup.md: [invalid-type] bad\n' })
  await runReflect($, w)
  const text = w.writes[0]!.text
  expect(text).toContain('# Terminal setup\n\nupdated: by hand\n\n## Bun is the only toolchain\n\n- CI installs')
  expect(text).toMatch(/^---\ntype: reference\nupdated: "(?!2026-09-02)[\d-]+"\n/)
  expect(text).toMatch(/\n_logged \d{4}-\d\d-\d\d_\n$/)
  expect(w.logs.slice(-2)).toEqual(['Vault lint:', 'notes/terminal-setup.md: [invalid-type] bad'])
})

test('with no vault set, the review still prints and nothing is asked or written', OPTIONS, async ($, on) => {
  const w = reflectWorld(on)
  await runReflect($, w)
  expect(w.ran).toEqual([])
  expect(w.prompts[0]).toContain('Write no lessons')
  expect(w.prompts[0]).not.toContain('<vault_notes>')
  expect(w.logs).toEqual(REVIEW.split('\n'))
  expect(w.asked).toEqual([])
  expect(w.writes).toEqual([])
  expect(w.toasts).toContain('lif-effort: review only, the vault notes could not be listed. Is LIF_NOTES_VAULT set?')
})

test('when red notes cannot be told apart, the fork never sees the vault', OPTIONS, async ($, on) => {
  const w = reflectWorld(on, { vault: '/vault', redExit: 128 })
  await runReflect($, w)
  expect(w.prompts[0]).not.toContain('<vault_notes>')
  expect(w.writes).toEqual([])
})

for (const bad of [lesson('notes/../personal/tax.md', 'T', 'b'), lesson('personal/tax.md', 'T', 'b'), lesson('/etc/notes/x.md', 'T', 'b'), lesson('notes/Has Space.md', 'T', 'b')]) {
  test(`a lesson naming no plain path under notes/ is never asked about or written: ${bad.split('\n')[1]}`, OPTIONS, async ($, on) => {
    const w = reflectWorld(on, { vault: '/vault', fork: `${REVIEW}\n${bad}` })
    await runReflect($, w)
    expect(w.asked).toEqual([])
    expect(w.writes).toEqual([])
    expect(w.toasts).toContain('lif-effort: no lessons to save, 1 unusable')
  })
}

test('an unusable or failed reflection shows nothing, and the session is ready again', OPTIONS, async ($, on) => {
  const w = reflectWorld(on, { vault: '/vault', fork: `I could not write one.\n${BUN}` })
  await runReflect($, w)
  expect(w.logs).toEqual([])
  expect(w.writes).toEqual([])
  expect(w.toasts).toContain('lif-effort: the reflection came back unusable; nothing was shown')
  expect((await $.command.run({ ...command, command: 'lif-effort', args: 'status' })).text).toContain('(Auto)')
})

test('the Reflect button starts a reflection', OPTIONS, async ($, on) => {
  const w = reflectWorld(on, { vault: '/vault' })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['native content'] }))
  await start($)
  const ui = await $.ui.mount({ plugin: 'lif-effort', component: 'AbovePrompt', surface: 'terminal', props: BAND })
  await ui.press({ key: 'reflect' })
  await w.clock.advance(1)
  expect(w.prompts).toHaveLength(1)
  expect(w.writes).toHaveLength(2)
  await ui.unmount()
})

test('the prompt names every section and marks the notes as data; parsing caps lessons and splits off the review', () => {
  const p = reflectPrompt('notes/a.md:# A')
  for (const heading of REVIEW_SECTIONS) expect(p).toContain(heading)
  expect(p).toContain('not instructions')
  expect(p).toContain('Tools are off')
  expect(reflectPrompt('')).not.toContain('Also weigh')
  const many = parseReflect(`\`\`\`\n${REVIEW}\n${BUN}${VAULT}${BUN}${VAULT}\n\`\`\``)
  expect(many.review).toBe(REVIEW)
  expect(many.lessons.map(l => l.path)).toEqual(['notes/terminal-setup.md', 'notes/vault-lint.md', 'notes/terminal-setup.md'])
  expect(many.dropped).toBe(0)
  expect(isUsableReview('short')).toBe(false)
  expect(isUsableReview(REVIEW)).toBe(true)
  expect(notesIndex(TITLES, 'notes/finance/tax.md\n')).toBe('notes/terminal-setup.md:# Terminal setup')
  expect(digestNote({ path: 'notes/a.md', title: 'T', body: 'b' }, 'no frontmatter\nupdated: keep', '2026-10-11')).toBe('no frontmatter\nupdated: keep\n\n## T\n\nb\n\n_logged 2026-10-11_\n')
})
