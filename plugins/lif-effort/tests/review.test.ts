import { expect, test, type Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { classifierRequest, parseVerdict } from '../hooks/classify'
import { readConfig } from '../hooks/config'
import { isUsableReview, reviewPrompt, REVIEW_SECTIONS } from '../hooks/summaries'
import { command, start, usage, world } from './world'

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

function reviewWorld(on: On, fork: string | null = REVIEW) {
  const w = world(on)
  const prompts: string[] = []
  const writes: string[] = []
  on('model.fork', (_$, e) => {
    prompts.push(e.prompt)
    return { value: fork === null ? { isAnswered: false, reason: 'nothing-to-fork' } : { isAnswered: true, text: fork, usage } }
  })
  on('fs.write', (_$, e) => {
    writes.push(e.path)
    return { value: undefined }
  })
  return { ...w, prompts, writes }
}

async function runReview($: Engine, w: ReturnType<typeof reviewWorld>, args = 'review') {
  await start($)
  await $.command.run({ ...command, command: 'lif-effort', args })
  await w.clock.advance(1)
}

test('a review forks the session with the CAFE(S) prompt and saves nothing', async ($, on) => {
  const w = reviewWorld(on)
  await runReview($, w, 'review the tests')
  expect(w.prompts).toHaveLength(1)
  expect(w.prompts[0]).toContain('## Do next time')
  expect(w.prompts[0]).toContain('Also weigh this: the tests')
  expect(w.writes).toEqual([])
})

test('a review that fails or comes back unusable still leaves the session ready', async ($, on) => {
  const w = reviewWorld(on, null)
  await runReview($, w)
  expect(w.writes).toEqual([])
  const again = await $.command.run({ ...command, command: 'lif-effort', args: 'status' })
  expect(again.text).toContain('Requests use')
})

test('the review prompt names every section and the usable check needs actions', () => {
  const p = reviewPrompt()
  for (const heading of REVIEW_SECTIONS) expect(p).toContain(heading)
  expect(p).not.toContain('Also weigh')
  expect(isUsableReview('short')).toBe(false)
  expect(isUsableReview(REVIEW + 'x'.repeat(100))).toBe(true)
})

test('the classifier prompt carries the work types and model rules only when it picks a model', () => {
  const config = readConfig({})
  const withModel = classifierRequest('fix the login bug', '', true, config).system
  const effortOnly = classifierRequest('fix the login bug', '', false, config).system
  expect(withModel).toContain('Exploration and review start at opus')
  expect(withModel).toContain('exploration (')
  expect(effortOnly).not.toContain('start at opus')
  expect(parseVerdict('{"work":"fixes","model":"sonnet","effort":"medium","reason":"x"}', true)).toEqual({
    model: 'sonnet',
    effort: 'medium',
    reason: 'x',
  })
})

test('a review prints one log line per line, as a document with tools off', async ($, on) => {
  const w = reviewWorld(on)
  await runReview($, w)
  expect(w.logs).toEqual(REVIEW.split('\n'))
  expect(w.prompts[0]).toContain('not a chat reply')
  expect(w.prompts[0]).toContain('Tools are off')
})
