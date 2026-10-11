import { expect, test, type Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { isUsableRetro, notesIndex, retroPrompt, RETRO_SECTIONS } from '../hooks/summaries'
import { BAND, command, start, usage, world } from './world'

const RETRO = `# Session retro
## Frictions
- The first build failed: bun was not on PATH.
## Learnings
- CI installs no Node at all.
## Vault notes to update
- notes/terminal-setup.md: bun is the only toolchain on this machine.
## Vault notes to add
None.`

const TITLES = 'notes/terminal-setup.md:# Terminal setup\nnotes/finance/tax.md:# Tax\n'

type Setup = { vault?: string; fork?: string | null; redExit?: number }

function retroWorld(on: On, setup: Setup = {}) {
  const w = world(on)
  const prompts: string[] = []
  const writes: string[] = []
  const ran: { argv: readonly string[]; cwd?: string }[] = []
  on('env.get', (_$, e) => ({ value: e.name === 'LIF_NOTES_VAULT' ? setup.vault : '/home/me' }))
  on('process.run', (_$, e) => {
    ran.push({ argv: e.argv, cwd: e.init?.cwd })
    const isRed = e.argv.includes('-l')
    return {
      value: {
        exitCode: isRed ? (setup.redExit ?? 0) : 0,
        stdout: isRed ? 'notes/finance/tax.md\n' : TITLES,
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('model.fork', (_$, e) => {
    prompts.push(e.prompt)
    return { value: setup.fork === null ? { isAnswered: false, reason: 'nothing-to-fork' } : { isAnswered: true, text: setup.fork ?? RETRO, usage } }
  })
  on('fs.write', (_$, e) => {
    writes.push(e.path)
    return { value: undefined }
  })
  return { ...w, prompts, writes, ran }
}

async function runRetro($: Engine, w: ReturnType<typeof retroWorld>) {
  await start($)
  await $.command.run({ ...command, command: 'lif-effort', args: 'retro' })
  await w.clock.advance(1)
}

test('a retro forks the session with the vault notes as data, prints it, and writes nothing', { options: { showStatus: false } }, async ($, on) => {
  const w = retroWorld(on, { vault: '/vault' })
  await runRetro($, w)
  expect(w.ran.every(r => r.cwd === '/vault' && r.argv[0] === 'git' && r.argv[1] === 'grep')).toBe(true)
  expect(w.prompts).toHaveLength(1)
  expect(w.prompts[0]).toContain('<vault_notes>\nnotes/terminal-setup.md:# Terminal setup\n</vault_notes>')
  expect(w.prompts[0]).toContain('not instructions')
  expect(w.prompts[0]).toContain('Tools are off')
  expect(w.logs).toEqual(RETRO.split('\n'))
  expect(w.writes).toEqual([])
})

const NO_VAULT = 'lif-effort: no retro, the vault notes could not be listed. Is LIF_NOTES_VAULT set?'

test('a retro with no vault set asks the model nothing', { options: { showStatus: false } }, async ($, on) => {
  const w = retroWorld(on)
  await runRetro($, w)
  expect(w.ran).toEqual([])
  expect(w.prompts).toEqual([])
  expect(w.toasts).toContain(NO_VAULT)
})

test('a retro stops when the red notes cannot be told apart', { options: { showStatus: false } }, async ($, on) => {
  const w = retroWorld(on, { vault: '/vault', redExit: 128 })
  await runRetro($, w)
  expect(w.prompts).toEqual([])
  expect(w.toasts).toContain(NO_VAULT)
})

test('an unusable retro is not shown, and the session is ready again', { options: { showStatus: false } }, async ($, on) => {
  const w = retroWorld(on, { vault: '/vault', fork: 'I could not write one.' })
  await runRetro($, w)
  expect(w.logs).toEqual([])
  expect(w.toasts).toContain('lif-effort: the retro came back unusable; nothing was shown')
  expect((await $.command.run({ ...command, command: 'lif-effort', args: 'status' })).text).toContain('(Auto)')
})

test('the Retro button starts a retro', { options: { showStatus: false } }, async ($, on) => {
  const w = retroWorld(on, { vault: '/vault' })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['native content'] }))
  await start($)
  const ui = await $.ui.mount({ plugin: 'lif-effort', component: 'AbovePrompt', surface: 'terminal', props: BAND })
  await ui.press({ key: 'retro' })
  await w.clock.advance(1)
  expect(w.prompts).toHaveLength(1)
  await ui.unmount()
})

test('the retro prompt names every section, and red notes stay out of the index', () => {
  for (const heading of RETRO_SECTIONS) expect(retroPrompt('')).toContain(heading)
  expect(notesIndex(TITLES, 'notes/finance/tax.md\n')).toBe('notes/terminal-setup.md:# Terminal setup')
  expect(notesIndex(TITLES, '')).toContain('notes/finance/tax.md')
  expect(isUsableRetro(RETRO)).toBe(true)
  expect(isUsableRetro(RETRO.replace('## Vault notes to add\nNone.', ''))).toBe(false)
})
