import { expect, test } from 'claude-code/testing'

import { parseGit, resetIn, tildify } from '../hooks/status'
import { BAND, start, turn, world } from './world'

const NOW = Date.parse('2026-10-10T12:00:00Z')
const LIMITS = [
  { kind: 'five_hour', percentUsed: 31, resetsAt: '2026-10-10T14:10:00Z' },
  { kind: 'seven_day', percentUsed: 92.4, resetsAt: '2026-10-15T00:00:00Z' },
]

function status(on: Parameters<typeof world>[0], dirty = true) {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, tokens: 84000, percent: 42 }, rateLimits: LIMITS } }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('env.get', () => ({ value: '/home/me' }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: `# branch.oid abc\n# branch.head main\n${dirty ? '1 .M N... 100644 100644 100644 a b f.ts\n' : ''}`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['native'] }))
}

test('parseGit reads the branch and whether anything is uncommitted', () => {
  expect(parseGit('# branch.head main\n')).toEqual({ branch: 'main', isDirty: false })
  expect(parseGit('# branch.head main\n? new.ts\n')).toEqual({ branch: 'main', isDirty: true })
  expect(parseGit('')).toEqual({ branch: null, isDirty: false })
})

test('tildify and resetIn shorten what the line shows', () => {
  expect(tildify('/home/me/code', '/home/me')).toBe('~/code')
  expect(tildify('/home/meow', '/home/me')).toBe('/home/meow')
  expect(resetIn('2026-10-10T14:10:00Z', NOW)).toBe('2h10m')
  expect(resetIn('2026-10-10T12:45:00Z', NOW)).toBe('45m')
  expect(resetIn('2026-10-09T00:00:00Z', NOW)).toBe('')
  expect(resetIn(undefined, NOW)).toBe('')
})

test('the status line shows directory, branch, context and both plan windows', async ($, on) => {
  world(on)
  status(on)
  await start($)
  await turn($, 'refactor the session store into its own module', 't1')
  const ui = await $.ui.mount({ plugin: 'lif-effort', component: 'AbovePrompt', surface: 'terminal', props: BAND })
  for (const text of [/\/repo/, /main\*/, /ctx 42%/, /5h 31%/, /wk 92%/]) {
    expect(await ui.find({ type: 'Text', text })).toBeDefined()
  }
  await ui.unmount()
})

test('the status line can be turned off', { options: { showStatus: false } }, async ($, on) => {
  world(on)
  status(on)
  await start($)
  const ui = await $.ui.mount({ plugin: 'lif-effort', component: 'AbovePrompt', surface: 'terminal', props: BAND })
  expect(await ui.find({ type: 'Text', text: /ctx / })).toBeUndefined()
  await ui.unmount()
})

test('the context number reads 0% before any measurement', async ($, on) => {
  world(on)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('env.get', () => ({ value: '/home/me' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['native'] }))
  await start($)
  const ui = await $.ui.mount({ plugin: 'lif-effort', component: 'AbovePrompt', surface: 'terminal', props: BAND })
  expect(await ui.find({ type: 'Text', text: /ctx 0%/ })).toBeDefined()
  await ui.unmount()
})

test('a new measurement updates the numbers on the next draw', async ($, on) => {
  world(on)
  status(on)
  await start($)
  await $.session.measure({
    context: { window: 200000, tokens: 190000, percent: 95 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 75 }],
    changed: ['context', 'rateLimits'],
  })
  const ui = await $.ui.mount({ plugin: 'lif-effort', component: 'AbovePrompt', surface: 'terminal', props: BAND })
  expect(await ui.find({ type: 'Text', text: /ctx 95%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /5h 75%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /wk / })).toBeUndefined()
  await ui.unmount()
})

test('the context number turns yellow, orange, then red', async ($, on) => {
  world(on)
  status(on)
  await start($)
  for (const [percent, color] of [[15, undefined], [16, 'yellow'], [21, '#ff8700'], [31, 'red']] as const) {
    await $.session.measure({ context: { window: 200000, tokens: percent * 2000, percent }, rateLimits: [{ kind: 'five_hour', percentUsed: 10 }], changed: ['context', 'rateLimits'] })
    const ui = await $.ui.mount({ plugin: 'lif-effort', component: 'AbovePrompt', surface: 'terminal', props: BAND })
    const node = await ui.find({ type: 'Text', text: new RegExp(`^ctx ${percent}%$`) })
    expect(node?.props?.color).toBe(color)
    await ui.unmount()
  }
})
