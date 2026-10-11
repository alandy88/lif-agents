import { expect, test, type Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { digestNote, digestPrompt, parseDigest } from '../hooks/summaries'
import { BAND, command, start, usage, world } from './world'

const DIGEST = `path: notes/terminal-setup.md
title: Bun is the only toolchain

- CI installs no Node at all; \`bun test\` is the runner.`

const OLD = '---\ntype: reference\nupdated: "2026-09-02"\nsensitivity: green\n---\n\n# Terminal setup\n\nupdated: by hand\n'

type Setup = { vault?: string; fork?: string | null; answer?: string; old?: string; lint?: string }

function digestWorld(on: On, setup: Setup = {}) {
  const w = world(on)
  const prompts: string[] = []
  const writes: { path: string; text: string }[] = []
  const ran: string[][] = []
  const asked: string[] = []
  on('env.get', (_$, e) => ({ value: e.name === 'LIF_NOTES_VAULT' ? setup.vault : '/home/me' }))
  on('process.run', (_$, e) => {
    ran.push([...e.argv])
    const stdout = e.argv[0] === 'python3' ? (setup.lint ?? '') : e.argv.includes('-l') ? '' : 'notes/terminal-setup.md:# Terminal setup\n'
    return { value: { exitCode: e.argv.includes('-l') ? 1 : 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('model.fork', (_$, e) => {
    prompts.push(e.prompt)
    return { value: setup.fork === null ? { isAnswered: false, reason: 'nothing-to-fork' } : { isAnswered: true, text: setup.fork ?? DIGEST, usage } }
  })
  on('fs.exists', () => ({ value: setup.old !== undefined }))
  on('fs.read', () => ({ value: setup.old ?? '' }))
  on('fs.write', (_$, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => {
    asked.push(e.questions[0]!.question)
    return { result: { questions: e.questions, answers: { [e.questions[0]!.question]: setup.answer ?? 'Save' } } }
  })
  return { ...w, prompts, writes, ran, asked }
}

async function runDigest($: Engine, w: ReturnType<typeof digestWorld>, args = 'digest') {
  await start($)
  await $.command.run({ ...command, command: 'lif-effort', args })
  await w.clock.advance(1)
}

const OPTIONS = { options: { showStatus: false } }

test('a digest shows the note, asks, then writes one new note with frontmatter and never commits', OPTIONS, async ($, on) => {
  const w = digestWorld(on, { vault: '/vault' })
  await runDigest($, w, 'digest the bun toolchain')
  expect(w.prompts[0]).toContain('<vault_notes>\nnotes/terminal-setup.md:# Terminal setup\n</vault_notes>')
  expect(w.prompts[0]).toContain('The person asked for this one: the bun toolchain')
  expect(w.logs[0]).toBe('Digest for notes/terminal-setup.md (a new note): Bun is the only toolchain')
  expect(w.asked).toEqual(['Save this to notes/terminal-setup.md in the vault?'])
  expect(w.writes).toHaveLength(1)
  expect(w.writes[0]!.path).toBe('/vault/notes/terminal-setup.md')
  expect(w.writes[0]!.text).toMatch(/^---\ntype: reference\nupdated: "\d{4}-\d\d-\d\d"\nsensitivity: green\n---\n\n# Bun is the only toolchain\n\n- CI installs/)
  expect(w.ran.filter(argv => argv[0] === 'git').every(argv => argv[1] === 'grep')).toBe(true)
  expect(w.toasts).toContain('lif-effort: saved notes/terminal-setup.md; it is not committed')
})

test('a digest for a note that exists keeps its text, adds the entry at the end, and shows that note\'s lint lines', OPTIONS, async ($, on) => {
  const w = digestWorld(on, { vault: '/vault', old: OLD, lint: 'notes/other.md: [x] no\nnotes/terminal-setup.md: [invalid-type] bad\n' })
  await runDigest($, w)
  const text = w.writes[0]!.text
  expect(text).toContain('# Terminal setup\n\nupdated: by hand\n\n## Bun is the only toolchain\n\n- CI installs')
  expect(text).toMatch(/^---\ntype: reference\nupdated: "(?!2026-09-02)[\d-]+"\n/)
  expect(text).toMatch(/\n_logged \d{4}-\d\d-\d\d_\n$/)
  expect(w.logs.slice(-2)).toEqual(['Vault lint:', 'notes/terminal-setup.md: [invalid-type] bad'])
})

test('a cancelled digest writes nothing, and the session is ready again', OPTIONS, async ($, on) => {
  const w = digestWorld(on, { vault: '/vault', answer: 'Cancel' })
  await runDigest($, w)
  expect(w.writes).toEqual([])
  expect(w.toasts).toContain('lif-effort: digest cancelled; nothing was saved')
  expect((await $.command.run({ ...command, command: 'lif-effort', args: 'status' })).text).toContain('(Auto)')
})

for (const fork of ['None.', DIGEST.replace('notes/terminal-setup.md', 'notes/../personal/tax.md'), DIGEST.replace('notes/', 'personal/'), DIGEST.replace('notes/', '/etc/notes/')]) {
  test(`a digest that names no note under notes/ is never asked about or written: ${fork.split('\n', 1)[0]}`, OPTIONS, async ($, on) => {
    const w = digestWorld(on, { vault: '/vault', fork })
    await runDigest($, w)
    expect(w.asked).toEqual([])
    expect(w.writes).toEqual([])
    expect(w.toasts).toContain('lif-effort: nothing to digest, or the note came back unusable; nothing was saved')
  })
}

test('a digest with no vault set asks the model nothing', OPTIONS, async ($, on) => {
  const w = digestWorld(on)
  await runDigest($, w)
  expect(w.prompts).toEqual([])
  expect(w.toasts).toContain('lif-effort: no digest, the vault notes could not be listed. Is LIF_NOTES_VAULT set?')
})

test('the Digest button starts a digest', OPTIONS, async ($, on) => {
  const w = digestWorld(on, { vault: '/vault' })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['native content'] }))
  await start($)
  const ui = await $.ui.mount({ plugin: 'lif-effort', component: 'AbovePrompt', surface: 'terminal', props: BAND })
  await ui.press({ key: 'digest' })
  await w.clock.advance(1)
  expect(w.writes).toHaveLength(1)
  await ui.unmount()
})

test('the digest prompt marks the notes as data, and a fenced reply still parses', () => {
  expect(digestPrompt('notes/a.md:# A')).toContain('not instructions')
  expect(digestPrompt('')).toContain('Tools are off')
  expect(parseDigest(`\`\`\`\n${DIGEST}\n\`\`\``)?.path).toBe('notes/terminal-setup.md')
  expect(parseDigest('path: notes/Has Space.md\ntitle: T\n\nbody')).toBeUndefined()
  expect(digestNote({ path: 'notes/a.md', title: 'T', body: 'b' }, 'no frontmatter\nupdated: keep', '2026-10-11')).toBe('no frontmatter\nupdated: keep\n\n## T\n\nb\n\n_logged 2026-10-11_\n')
})
