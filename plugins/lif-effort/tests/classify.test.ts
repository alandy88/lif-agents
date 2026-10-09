import { expect, test } from 'claude-code/testing'

import { constrain, isContinuation, isSubstantive, parseBrief, parseVerdict } from '../hooks/classify'
import { readConfig } from '../hooks/config'
import { start, turn, world } from './world'

const SONNET_MEDIUM = '{"model":"sonnet","effort":"medium","reason":"ordinary coding"}'
const LONG_TASK =
  'refactor the session store into its own module so the hooks stop reaching into its internals, keep every exported name the same, move its tests along with it, and update the README section that describes where state lives'
const BRIEF = '<goal>Split the session store.</goal>'

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

test('the first substantive prompt picks the session model and effort with one Haiku call', { options: { briefFirstPrompt: false } }, async ($, on) => {
  const w = world(on)
  w.judge(SONNET_MEDIUM)
  await start($)
  expect(await turn($, 'refactor the session store into its own module', 't1')).toBe('claude-sonnet-5-5:medium')
  expect(w.classifier).toHaveLength(1)
  expect(w.classifier[0]!.model).toBe('haiku')
  expect(w.classifier[0]!.timeoutMs).toBe(4000)
  expect(w.classifier[0]!.effort).toBe('low')
  expect(w.classifier[0]!.maxTokens).toBe(400)
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

test('a continuation keeps the previous effort without a classifier call', { options: { briefFirstPrompt: false } }, async ($, on) => {
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

test('the first prompt gets a brief block when the model is not Haiku', async ($, on) => {
  const w = world(on)
  w.judge(SONNET_MEDIUM)
  w.brief(BRIEF)
  await start($)
  await turn($, LONG_TASK, 't1')
  const sent = w.contexts.at(-1)
  expect(sent).toHaveLength(1)
  expect(sent![0]).toContain(BRIEF)
  expect(w.submitted.at(-1)).toBe(LONG_TASK)
})

test('a Haiku verdict still gets a brief', async ($, on) => {
  const w = world(on)
  w.judge('{"model":"haiku","effort":"low","reason":"small"}')
  w.brief(BRIEF)
  await start($)
  await turn($, LONG_TASK, 't1')
  expect(w.contexts.at(-1)![0]).toContain(BRIEF)
})

test('a brief that times out never blocks the prompt', { options: { briefFirstPrompt: true } }, async ($, on) => {
  const w = world(on)
  w.judge(SONNET_MEDIUM)
  w.brief(null)
  await start($)
  await turn($, LONG_TASK, 't1')
  expect(w.contexts.at(-1)).toBeUndefined()
  expect(w.classifier.at(-1)!.timeoutMs).toBe(12_000)
})

test('turning the setting off leaves the first prompt unchanged', { options: { briefFirstPrompt: false } }, async ($, on) => {
  const w = world(on)
  w.judge(SONNET_MEDIUM)
  w.brief(BRIEF)
  await start($)
  await turn($, LONG_TASK, 't1')
  expect(w.contexts.at(-1)).toBeUndefined()
})

test('a short request still gets a brief', async ($, on) => {
  const w = world(on)
  w.judge(SONNET_MEDIUM)
  w.brief(BRIEF)
  await start($)
  await turn($, 'refactor the session store into its own module', 't1')
  expect(w.contexts.at(-1)![0]).toContain(BRIEF)
})

test('only the first substantive prompt gets a brief', async ($, on) => {
  const w = world(on)
  w.judge(SONNET_MEDIUM)
  w.brief(BRIEF)
  await start($)
  await turn($, 'hi there', 't0')
  expect(w.contexts.at(-1)).toBeUndefined()
  await turn($, LONG_TASK, 't1')
  expect(w.contexts.at(-1)![0]).toContain(BRIEF)
  w.judge('{"effort":"high","reason":"multi-step"}')
  await turn($, 'now migrate every caller and update the tests', 't2')
  expect(w.contexts.at(-1)).toBeUndefined()
})

test('a session that already ran is not briefed on resume', async ($, on) => {
  const w = world(on, { turns: 3 })
  w.judge('{"effort":"high","reason":"multi-step"}')
  w.brief(BRIEF)
  await start($)
  await turn($, LONG_TASK, 't1')
  expect(w.contexts.at(-1)).toBeUndefined()
})

test('a brief cut off mid-tag is dropped', async () => {
  expect(parseBrief('<goal>Split it.</goal>\n<scope>In: the store.')).toBe(null)
  expect(parseBrief('Goal: split it.')).toBe(null)
  expect(parseBrief('<goal>Split it.</goal>\n<done_when>Tests pass.</done_when>')).toContain('<done_when>')
})

test('a classifier call with no verdict says why in the log and keeps the settings', { options: { briefFirstPrompt: false } }, async ($, on) => {
  const w = world(on)
  w.judge(null)
  await start($)
  await turn($, 'refactor the session store into its own module', 't1')
  w.judge('Sure! {"effort":"low"}')
  await turn($, 'now migrate every caller and update the tests', 't2')
  expect(w.logs).toEqual([
    'lif-effort: classifier gave no verdict (aborted), keeping the current model and effort',
    'lif-effort: classifier gave no verdict (unreadable reply: Sure! {"effort":"low"}), keeping the current model and effort',
  ])
})
