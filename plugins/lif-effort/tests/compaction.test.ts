import { expect, test } from 'claude-code/testing'
import type { SessionMessage } from 'claude-code'

import { COMPACT_SECTIONS, renderTranscript } from '../hooks/summaries'
import { start, world } from './world'

const GOOD = `${COMPACT_SECTIONS.map(h => `${h}\nKept detail for ${h}.`).join('\n\n')}\n${'More detail. '.repeat(20)}`
const TRANSCRIPT: SessionMessage[] = [
  { role: 'user', text: 'Add retries to the uploader', toolUses: [] },
  { role: 'assistant', text: 'Done.', toolUses: [{ tool_use_id: 'u1', tool: 'Edit', input: { file_path: 'up.ts' }, text: 'ok' }] },
]
const NATIVE: SessionMessage = { role: 'user', text: 'native summary', toolUses: [] }

function compactWorld(on: Parameters<typeof world>[0]) {
  const w = world(on)
  let native = 0
  on('session.compact', () => {
    native++
    return { messages: [NATIVE] }
  })
  return { ...w, natives: () => native }
}

test('Haiku writes the summary that replaces the conversation', async ($, on) => {
  const w = compactWorld(on)
  w.judge(GOOD)
  await start($)
  const result = await $.session.compact({ trigger: 'manual', messages: TRANSCRIPT, instructions: 'keep the retry policy' })
  expect(w.natives()).toBe(0)
  expect(w.classifier[0]!.model).toBe('haiku')
  expect(w.classifier[0]!.prompt).toContain('keep the retry policy')
  expect(w.classifier[0]!.prompt).toContain('Add retries to the uploader')
  expect(result.messages).toHaveLength(1)
  expect(result.messages![0]!.text).toContain('## Outstanding work')
})

test('an unusable Haiku summary falls back to the native compaction', async ($, on) => {
  const w = compactWorld(on)
  w.judge('Summary: stuff happened.')
  await start($)
  const result = await $.session.compact({ trigger: 'auto', messages: TRANSCRIPT })
  expect(w.natives()).toBe(1)
  expect(result.messages).toEqual([NATIVE])
  expect(w.toasts.some(t => t.includes('native compaction'))).toBe(true)
})

test('a failed Haiku call falls back to the native compaction', async ($, on) => {
  const w = compactWorld(on)
  w.judge(null)
  await start($)
  expect((await $.session.compact({ trigger: 'manual', messages: TRANSCRIPT })).messages).toEqual([NATIVE])
})

test('the session-model setting always uses the native compaction', { options: { compactionModel: 'session' } }, async ($, on) => {
  const w = compactWorld(on)
  w.judge(GOOD)
  await start($)
  expect((await $.session.compact({ trigger: 'manual', messages: TRANSCRIPT })).messages).toEqual([NATIVE])
  expect(w.classifier).toHaveLength(0)
})

test('precomputed and subagent compactions are left to the engine', async ($, on) => {
  const w = compactWorld(on)
  w.judge(GOOD)
  await start($)
  expect((await $.session.compact({ trigger: 'precompute', messages: TRANSCRIPT })).skip).toBeDefined()
  expect((await $.session.compact({ trigger: 'auto', agentId: 'worker', messages: TRANSCRIPT })).messages).toEqual([NATIVE])
  expect(w.classifier).toHaveLength(0)
})

test('a long transcript keeps its start and its recent end', async () => {
  const many: SessionMessage[] = Array.from({ length: 400 }, (_, i) => ({ role: 'user' as const, text: `request ${i} ${'x'.repeat(200)}`, toolUses: [] }))
  const text = renderTranscript(many, 20_000)
  expect(text.length).toBeLessThan(20_200)
  expect(text).toContain('request 0 ')
  expect(text).toContain('request 399 ')
  expect(text).toContain('characters omitted')
  const errors = renderTranscript([{ role: 'assistant', text: '', toolUses: [{ tool_use_id: 'b', tool: 'Bash', input: { command: 'make' }, text: 'boom', isError: true }] }])
  expect(errors).toContain('ERROR: boom')
})
