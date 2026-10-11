import { expect, test } from 'claude-code/testing'

import { command, prompt, start, step, turn, world } from './world'

const SONNET_MEDIUM = '{"model":"sonnet","effort":"medium","reason":"ordinary coding"}'
const TASK = 'refactor the session store into its own module'

test('a manual model change stops automatic model selection for the session', async ($, on) => {
  const w = world(on)
  w.judge(SONNET_MEDIUM)
  await start($)
  await turn($, TASK, 't1')
  await $.classic.PostModelSwitch({
    from_model: 'claude-opus-5-5',
    to_model: 'claude-opus-5-5',
    requested_model: 'opus',
    source: 'picker',
    context_tokens: 0,
    prompt_cache_warm: true,
    cache_ttl: '5m',
    estimated_cache_write_usd: 0,
    pricing: 'catalog',
  })
  // The person's model now; the automatic effort still applies.
  expect(await turn($, 'continue', 't2')).toBe('claude-opus-5-5:medium')
})

test('a manual effort change stops automatic effort until it is turned back on', async ($, on) => {
  const w = world(on)
  w.judge(SONNET_MEDIUM)
  await start($)
  await turn($, TASK, 't1')
  // The engine now reports another session effort: the person ran /effort.
  expect(await turn($, 'continue', 't2', { effort: 'max' })).toBe('claude-sonnet-5-5:max')
  expect(w.toasts.some(t => t.includes('automatic effort is off'))).toBe(true)
  await $.command.run({ ...command, command: 'lif-effort', args: 'auto on' })
  w.judge('{"effort":"low","reason":"small"}')
  expect(await turn($, 'rename that helper to loadStored please', 't3', { effort: 'max' })).toBe('claude-sonnet-5-5:low')
})

test('a prompt queued during a turn cannot change that running turn', async ($, on) => {
  const w = world(on)
  w.judge(SONNET_MEDIUM)
  await start($)
  await turn($, TASK, 't1')
  w.judge('{"effort":"low","reason":"tiny"}')
  await prompt($, 'also fix the typo in the readme', 't1')
  expect(await step($, 't1', { index: 1 })).toBe('claude-sonnet-5-5:medium')
  await $.turn.start({ text: 'also fix the typo in the readme', turnId: 't2' })
  expect(await step($, 't2')).toBe('claude-sonnet-5-5:low')
})

test('subagent requests are never rewritten', async ($, on) => {
  const w = world(on)
  w.judge(SONNET_MEDIUM)
  await start($)
  await turn($, TASK, 't1')
  expect(await step($, 't1', { agentId: 'worker', model: 'claude-haiku-5-5', effort: undefined })).toBe('claude-haiku-5-5:none')
})

test('turning Auto off sends requests with the native model and effort', async ($, on) => {
  const w = world(on)
  w.judge(SONNET_MEDIUM)
  await start($)
  await turn($, TASK, 't1')
  await $.command.run({ ...command, command: 'lif-effort', args: 'auto off' })
  expect(await step($, 't1', { index: 1 })).toBe('claude-opus-5-5:high')
})

test('a resumed session restores its own selection and no other session sees it', async ($, on) => {
  const w = world(on, { id: 'first' })
  w.judge(SONNET_MEDIUM)
  await start($)
  await turn($, TASK, 't1')

  w.setId('other')
  await $.classic.SessionStart({ source: 'resume' })
  expect(await step($, 't9')).toBe('claude-opus-5-5:high')

  w.setId('first')
  await $.classic.SessionStart({ source: 'resume' })
  expect(await step($, 't10')).toBe('claude-sonnet-5-5:medium')
})

test('a session that already ran keeps its model when the plugin loads late', async ($, on) => {
  const w = world(on, { turns: 3 })
  w.judge('{"effort":"high","reason":"multi-step"}')
  await start($)
  expect(await turn($, TASK, 't1')).toBe('claude-opus-5-5:high')
  expect(w.classifier[0]!.system).not.toContain('"model"')
})

test('a clear starts a new selection cycle and keeps Auto off when it was off', async ($, on) => {
  const w = world(on)
  w.judge(SONNET_MEDIUM)
  await start($)
  await turn($, TASK, 't1')
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { sessionId: 's1' } as never })
  w.setId('s2')
  await $.classic.SessionStart({ source: 'clear' })
  w.judge('{"model":"opus","effort":"high","reason":"hard"}')
  expect(await turn($, 'design the new storage schema for sessions', 't2')).toBe('claude-opus-5-5:high')

  await $.command.run({ ...command, command: 'lif-effort', args: 'auto off' })
  await $.session.end({ reason: 'clear', sessionId: 's2', resume: { sessionId: 's2' } as never })
  w.setId('s3')
  await $.classic.SessionStart({ source: 'clear' })
  expect(await turn($, TASK, 't3')).toBe('claude-opus-5-5:high')
  const status = await $.command.run({ ...command, command: 'lif-effort', args: 'status' })
  expect(status.text).toContain('(Off)')
})

test('the status command separates the app setting from what requests use', async ($, on) => {
  const w = world(on)
  w.judge(SONNET_MEDIUM)
  await start($)
  await turn($, TASK, 't1')
  const status = await $.command.run({ ...command, command: 'lif-effort', args: '' })
  expect(status.text).toContain('Requests use: Sonnet 5.5 · Medium (Auto)')
  expect(status.text).toContain("App's own setting: claude-opus-5-5 · high")
})
