import { expect, test } from 'claude-code/testing'
import type { AgentInfo } from 'claude-code'

import { agentRows, activityOf } from '../hooks/agents'
import { fresh } from '../hooks/lifecycle'
import { modeLabel } from '../hooks/ui'
import { BAND, start, turn, world } from './world'

const SONNET_MEDIUM = '{"model":"sonnet","effort":"medium","reason":"ordinary coding"}'
const AGENTS: AgentInfo[] = [
  { id: 'a1', description: 'Find callers', type: 'Explore', status: 'running' },
  { id: 'a2', description: 'Write tests', type: 'general-purpose', status: 'completed' },
]

function native(on: Parameters<typeof world>[0]) {
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['native content'] }))
}

test('the bar shows the model and effort requests use, with its controls, on every surface', async ($, on) => {
  const w = world(on)
  native(on)
  w.judge(SONNET_MEDIUM)
  await start($)
  await turn($, 'refactor the session store into its own module', 't1')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'lif-effort', component: 'AbovePrompt', surface, props: BAND })
    expect(await ui.find({ type: 'Text', text: 'native content' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Sonnet 5\.5 · Medium/ })).toBeDefined()
    for (const key of ['auto', 'compact', 'handoff', 'commit', 'pr', 'review', 'agents']) expect(await ui.find({ key })).toBeDefined()
    await ui.unmount()
  }
})

test('the mode control turns automation off and back on', async ($, on) => {
  const w = world(on)
  native(on)
  w.judge(SONNET_MEDIUM)
  await start($)
  await turn($, 'refactor the session store into its own module', 't1')
  const ui = await $.ui.mount({ plugin: 'lif-effort', component: 'AbovePrompt', surface: 'terminal', props: BAND })
  await ui.press({ key: 'auto' })
  expect((await ui.find({ key: 'auto' }))?.text).toBe('Off')
  expect(await ui.find({ type: 'Text', text: /Opus 5\.5 · High/ })).toBeDefined()
  await ui.press({ key: 'auto' })
  expect((await ui.find({ key: 'auto' }))?.text).toBe('Auto')
  await ui.unmount()
})

test('a narrow terminal shows command equivalents instead of buttons', async ($, on) => {
  world(on)
  native(on)
  await start($)
  const ui = await $.ui.mount({ plugin: 'lif-effort', component: 'AbovePrompt', surface: 'terminal', props: { ...BAND, bodyColumns: 40 } })
  expect(await ui.find({ type: 'Text', text: /\/compact · \/lif-effort auto · handoff · commit · pr · review · agents/ })).toBeDefined()
  expect(await ui.find({ key: 'compact' })).toBeUndefined()
  await ui.unmount()
})

test('the Compact control puts /compact in an empty prompt box, never over a draft', async ($, on) => {
  const w = world(on)
  native(on)
  const filled: string[] = []
  let draft = ''
  on('prompt.read', () => ({ value: { text: draft, cursor: 0 } as never }))
  on('prompt.fill', ($, e) => {
    filled.push(e.text)
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })
  await start($)
  const ui = await $.ui.mount({ plugin: 'lif-effort', component: 'AbovePrompt', surface: 'terminal', props: BAND })
  await ui.press({ key: 'compact' })
  draft = 'half-written prompt'
  await ui.press({ key: 'compact' })
  expect(filled).toEqual(['/compact'])
  expect(w.toasts).toContain('lif-effort: type /compact to compact with Haiku')
  await ui.unmount()
})

test('the classification reason shows only when enabled', { options: { showReason: true } }, async ($, on) => {
  const w = world(on)
  native(on)
  w.judge(SONNET_MEDIUM)
  await start($)
  await turn($, 'refactor the session store into its own module', 't1')
  const ui = await $.ui.mount({ plugin: 'lif-effort', component: 'AbovePrompt', surface: 'terminal', props: BAND })
  expect(await ui.find({ type: 'Text', text: /ordinary coding/ })).toBeDefined()
  await ui.unmount()
})

test('the bar names each state', async () => {
  expect(modeLabel({ ...fresh(), phase: 'classifying' })).toBe('Classifying…')
  expect(modeLabel({ ...fresh(), phase: 'compacting' })).toBe('Compacting…')
  expect(modeLabel({ ...fresh(), phase: 'handoff' })).toBe('Writing handoff…')
  expect(modeLabel({ ...fresh(), isAuto: false })).toBe('Off')
  expect(modeLabel({ ...fresh(), isEffortAuto: false })).toBe('Manual effort')
  expect(modeLabel(fresh())).toBe('Auto')
})

test('agent visibility filters finished agents and keeps details', async () => {
  const details = new Map([['a1', { model: 'claude-haiku-5-5', activity: 'Grep readConfig' }]])
  expect(agentRows(AGENTS, details, 'active').map(a => a.id)).toEqual(['a1'])
  expect(agentRows(AGENTS, details, 'all').map(a => a.id)).toEqual(['a1', 'a2'])
  expect(agentRows(AGENTS, details, 'active')[0]).toMatchObject({ model: 'claude-haiku-5-5', activity: 'Grep readConfig' })
  expect(activityOf('Bash', { command: 'bun test\nmore' })).toBe('Bash bun test')
})

test('the bar counts native subagents and the panel lists them', async ($, on) => {
  const w = world(on, { agents: AGENTS })
  native(on)
  await start($)
  await w.clock.advance(2000)
  const band = await $.ui.mount({ plugin: 'lif-effort', component: 'AbovePrompt', surface: 'terminal', props: BAND })
  expect((await band.find({ key: 'agents' }))?.text).toBe('Agents (1)')
  await band.unmount()
  const pane = await $.ui.mount({
    plugin: 'lif-effort',
    component: 'Pane',
    surface: 'terminal',
    requestId: 'lif-effort-agents',
    props: { title: 'Agents', bodyColumns: 80, scroll: { offset: 0, bodyRows: 20 } } as never,
  })
  expect(await pane.find({ type: 'Text', text: /Find callers/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /Write tests/ })).toBeUndefined()
  await pane.unmount()
})
