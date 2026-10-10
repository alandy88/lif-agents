import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { BAND, command, start, world } from './world'

function gitWorld(on: On) {
  const w = world(on)
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['native content'] }))
  const spawned: { model?: string; prompt: string; subagentType?: string }[] = []
  on('agent.spawn', ($, e) => {
    spawned.push({ model: e.model, prompt: e.prompt, subagentType: e.subagentType })
    return { model: 'haiku', agentId: `g${spawned.length}` }
  })
  return { w, spawned }
}

test('Commit and Open PR each start their own Haiku subagent, not the session', async ($, on) => {
  const { w, spawned } = gitWorld(on)
  await start($)
  const ui = await $.ui.mount({ plugin: 'lif-effort', component: 'AbovePrompt', surface: 'terminal', props: BAND })
  await ui.press({ key: 'commit' })
  await ui.press({ key: 'pr' })
  expect(spawned.map(s => s.model)).toEqual(['haiku', 'haiku'])
  expect(spawned[0]?.prompt).toMatch(/push them to the remote/)
  expect(spawned[0]?.prompt).toMatch(/If it is main or master, push to main or master/)
  expect(spawned[1]?.prompt).toMatch(/create and switch to a new branch/)
  expect(spawned[1]?.prompt).toMatch(/gh pr create/)
  expect(w.toasts).toEqual(['lif-effort: Haiku started: commit and push', 'lif-effort: Haiku started: open PR'])
  await ui.unmount()
})

test('a subagent that cannot start is reported, and the commands start the same jobs', async ($, on) => {
  const w = world(on)
  on('agent.spawn', () => ({ deny: 'no agents here' }))
  await start($)
  await $.command.run({ ...command, command: 'lif-effort', args: 'commit' })
  await w.clock.advance(1)
  expect(w.toasts).toContain('lif-effort: commit and push did not start (no agents here)')
})
