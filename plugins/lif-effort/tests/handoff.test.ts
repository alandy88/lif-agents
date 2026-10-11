import { expect, test, type Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { datedHandoffName, isUsableHandoff } from '../hooks/summaries'
import { command, prompt, start, step, usage, world } from './world'

const HANDOFF = `# Handoff
## Goal
Ship retries.
## Done
Edited up.ts.
## Decisions
Three attempts.
## Files
up.ts
## Open issues
None.
## Next step
Write the retry tests in up.test.ts.`

type Setup = { exists?: string[]; failWrite?: boolean; answers?: string[]; fork?: string | null }

function handoffWorld(on: On, setup: Setup = {}) {
  const w = world(on)
  const writes: string[] = []
  const commands: string[] = []
  const filled: string[] = []
  const argvs: string[][] = []
  const answers = [...(setup.answers ?? [])]
  on('model.fork', () => ({
    value: setup.fork === null ? { isAnswered: false, reason: 'nothing-to-fork' } : { isAnswered: true, text: setup.fork ?? HANDOFF, usage },
  }))
  on('process.run', ($, e) => {
    argvs.push([...e.argv])
    return { value: { exitCode: 0, stdout: 'main', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('fs.exists', ($, e) => ({ value: (setup.exists ?? []).some(name => e.path.endsWith(`/${name}`)) }))
  on('fs.write', ($, e) => {
    if (setup.failWrite) return { deny: 'read-only file system' }
    writes.push(e.path)
    return { value: undefined }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => ({
    result: { questions: e.questions, answers: { [e.questions[0]!.question]: answers.shift() ?? '' } },
  }))
  on('command.run', { command: 'clear' }, () => {
    commands.push('clear')
    w.setId('s2')
    return { text: '' }
  })
  on('prompt.fill', ($, e) => {
    filled.push(e.text)
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })
  return { ...w, writes, commands, filled, argvs }
}

async function runHandoff($: Engine, w: ReturnType<typeof handoffWorld>) {
  await start($)
  await $.command.run({ ...command, command: 'lif-effort', args: 'handoff' })
  await w.clock.advance(1)
}

test('a handoff saves HANDOFF.md, confirms, clears, and leaves the continuation waiting', async ($, on) => {
  const w = handoffWorld(on, { answers: ['Start fresh'] })
  await runHandoff($, w)
  expect(w.writes).toEqual(['/repo/HANDOFF.md'])
  expect(w.commands).toEqual(['clear'])
  expect(w.filled[0]).toContain('HANDOFF.md')
  expect(w.submitted).toHaveLength(0)
})

test('the git commands a handoff runs are read-only', async ($, on) => {
  const w = handoffWorld(on, { answers: ['Keep this conversation'] })
  await runHandoff($, w)
  for (const argv of w.argvs) expect(['status', 'log', 'diff']).toContain(argv[1])
  expect(w.argvs.flat()).not.toContain('stash')
})

test('declining the clear keeps the conversation and the saved file', async ($, on) => {
  const w = handoffWorld(on, { answers: ['Keep this conversation'] })
  await runHandoff($, w)
  expect(w.writes).toHaveLength(1)
  expect(w.commands).toHaveLength(0)
})

test('a failed save never clears the conversation', async ($, on) => {
  const w = handoffWorld(on, { failWrite: true, answers: ['Start fresh'] })
  await runHandoff($, w)
  expect(w.commands).toHaveLength(0)
  expect(w.toasts.some(t => t.includes('could not save'))).toBe(true)
})

test('an existing HANDOFF.md is never overwritten unasked', async ($, on) => {
  const w = handoffWorld(on, { exists: ['HANDOFF.md'], answers: ['Keep both', 'Keep this conversation'] })
  await runHandoff($, w)
  expect(w.writes).toEqual([`/repo/${datedHandoffName(w.clock.now())}`])
})

test('dismissing the existing-file question saves nothing', async ($, on) => {
  const w = handoffWorld(on, { exists: ['HANDOFF.md'], answers: [''] })
  await runHandoff($, w)
  expect(w.writes).toHaveLength(0)
})

test('a waiting handoff\'s task goes only to the session it cleared into', async ($, on) => {
  const w = handoffWorld(on, { answers: ['Start fresh'] })
  w.judge('{"effort":"medium","reason":"tests"}')
  await runHandoff($, w)
  w.setId('other')
  await prompt($, w.filled[0]!)
  expect(w.classifier.at(-1)?.prompt ?? '').not.toContain('Write the retry tests')
  w.setId('s2')
  await prompt($, w.filled[0]!)
  expect(w.classifier.at(-1)!.prompt).toContain('Write the retry tests in up.test.ts.')
})

test('cancelling at the existing file saves nothing', async ($, on) => {
  const w = handoffWorld(on, { exists: ['HANDOFF.md'], answers: ['Cancel'] })
  await runHandoff($, w)
  expect(w.writes).toHaveLength(0)
  expect(w.commands).toHaveLength(0)
})

test('an unusable or missing handoff saves nothing', async ($, on) => {
  const w = handoffWorld(on, { fork: 'I could not write one.', answers: ['Start fresh'] })
  await runHandoff($, w)
  expect(w.writes).toHaveLength(0)
  expect(w.commands).toHaveLength(0)
})

test('save-only mode never asks to clear', { options: { afterHandoff: 'save' } }, async ($, on) => {
  const w = handoffWorld(on, { answers: ['Start fresh'] })
  await runHandoff($, w)
  expect(w.writes).toHaveLength(1)
  expect(w.commands).toHaveLength(0)
})

test('continue mode submits the continuation and classifies the carried task', { options: { afterHandoff: 'continue' } }, async ($, on) => {
  const w = handoffWorld(on, { answers: ['Start fresh'] })
  w.judge('{"model":"sonnet","effort":"medium","reason":"tests"}')
  await runHandoff($, w)
  expect(w.commands).toEqual(['clear'])
  expect(w.submitted[0]).toContain('Continue the work described in HANDOFF.md')
  const judged = w.classifier.at(-1)!
  expect(judged.prompt).toContain('Write the retry tests in up.test.ts.')
  expect(judged.prompt).not.toContain('Continue the work described')
  expect(judged.system).toContain('"model"')
  await $.turn.start({ text: w.submitted[0]!, turnId: 't1' })
  expect(await step($, 't1')).toBe('claude-opus-5-5:medium')
})

test('a waiting handoff never starts on a weaker model than the one that wrote it', async ($, on) => {
  const w = handoffWorld(on, { answers: ['Start fresh'] })
  w.judge('{"model":"haiku","effort":"low","reason":"one small step"}')
  await runHandoff($, w)
  await prompt($, w.filled[0]!)
  await $.turn.start({ text: w.filled[0]!, turnId: 't1' })
  expect(await step($, 't1')).toBe('claude-opus-5-5:low')
})

test('a handoff missing any heading is not saved', async () => {
  expect(isUsableHandoff(HANDOFF)).toBe(true)
  expect(isUsableHandoff(HANDOFF.replace('## Files\nup.ts\n', ''))).toBe(false)
})
