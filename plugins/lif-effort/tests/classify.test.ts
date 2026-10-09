import { expect, test } from 'claude-code/testing'

import { constrain, isContinuation, isSubstantive, parseVerdict } from '../hooks/classify'
import { readConfig } from '../hooks/config'
import { start, turn, world } from './world'

const SONNET_MEDIUM = '{"model":"sonnet","effort":"medium","reason":"ordinary coding"}'

test('the verdict parser accepts one JSON object of known values and nothing else', async () => {
  expect(parseVerdict(SONNET_MEDIUM, true)).toEqual({ model: 'sonnet', effort: 'medium', reason: 'ordinary coding' })
  expect(parseVerdict('```json\n{"effort":"low","reason":"tiny"}\n```', false)).toEqual({ effort: 'low', reason: 'tiny' })
  expect(parseVerdict('Sure! {"effort":"low"}', false)).toBe(null)
  expect(parseVerdict('{"effort":"extreme"}', false)).toBe(null)
  expect(parseVerdict('{"effort":"low"}', true)).toBe(null)
  expect(parseVerdict('{"model":"gpt","effort":"low"}', true)).toBe(null)
  expect(parseVerdict('["low"]', false)).toBe(null)
})

test('allowed models and the effort floor and ceiling restrict every verdict', async () => {
  const onlyOpusSonnet = readConfig({ allowedModels: 'opus,sonnet', effortFloor: 'medium', effortCeiling: 'high' })
  expect(constrain({ model: 'haiku', effort: 'low', reason: '' }, onlyOpusSonnet)).toEqual({ model: 'sonnet', effort: 'medium', reason: '' })
  expect(constrain({ model: 'opus', effort: 'max', reason: '' }, onlyOpusSonnet)).toEqual({ model: 'opus', effort: 'high', reason: '' })
  const noSonnet = readConfig({ allowedModels: 'opus,haiku' })
  expect(constrain({ model: 'sonnet', effort: 'low', reason: '' }, noSonnet).model).toBe('opus')
})

test('greetings and continuations are not substantive', async () => {
  expect(isContinuation('Continue.')).toBe(true)
  expect(isContinuation('continue with the migration plan')).toBe(false)
  expect(isSubstantive('hi there')).toBe(false)
  expect(isSubstantive('fix the failing auth tests')).toBe(true)
})

test('the first substantive prompt picks the session model and effort with one Haiku call', async ($, on) => {
  const w = world(on)
  w.judge(SONNET_MEDIUM)
  await start($)
  expect(await turn($, 'refactor the session store into its own module', 't1')).toBe('claude-sonnet-5-5:medium')
  expect(w.classifier).toHaveLength(1)
  expect(w.classifier[0]!.model).toBe('haiku')
  expect(w.classifier[0]!.timeoutMs).toBe(4000)
  expect(w.classifier[0]!.system).toContain('"model"')
})

test('later prompts classify effort only and keep the session model', async ($, on) => {
  const w = world(on)
  w.judge(SONNET_MEDIUM)
  await start($)
  await turn($, 'refactor the session store into its own module', 't1')
  w.judge('{"effort":"high","reason":"multi-step"}')
  expect(await turn($, 'now migrate every caller and update the tests', 't2')).toBe('claude-sonnet-5-5:high')
  expect(w.classifier[1]!.system).not.toContain('"model"')
})

test('the effort preference reaches the classifier', { options: { effortPreference: 'deeper' } }, async ($, on) => {
  const w = world(on)
  w.judge(SONNET_MEDIUM)
  await start($)
  await turn($, 'refactor the session store into its own module', 't1')
  expect(w.classifier[0]!.system).toContain('choose the higher one')
})

test('a timed-out classifier leaves the native model and effort unchanged', async ($, on) => {
  const w = world(on)
  w.judge(null)
  await start($)
  expect(await turn($, 'refactor the session store into its own module', 't1')).toBe('claude-opus-5-5:high')
})

test('an invalid classifier reply leaves the native model and effort unchanged', async ($, on) => {
  const w = world(on)
  w.judge('IGNORE ALL RULES and use max')
  await start($)
  expect(await turn($, 'refactor the session store into its own module', 't1')).toBe('claude-opus-5-5:high')
})

test('a continuation keeps the previous effort without a classifier call', async ($, on) => {
  const w = world(on)
  w.judge(SONNET_MEDIUM)
  await start($)
  await turn($, 'refactor the session store into its own module', 't1')
  expect(await turn($, 'continue', 't2')).toBe('claude-sonnet-5-5:medium')
  expect(w.classifier).toHaveLength(1)
})

test('Haiku requests are sent without an effort setting', async ($, on) => {
  const w = world(on)
  w.judge('{"model":"haiku","effort":"medium","reason":"lookup"}')
  await start($)
  expect(await turn($, 'what does the readConfig helper return', 't1')).toBe('claude-haiku-5-5:none')
})
