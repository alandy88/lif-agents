import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { blocks, spans } from '../hooks/markdown'
import { THEMES } from '../hooks/themes'

const SURFACES = ['terminal', 'desktop'] as const
const command = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const
const PROMPT = { text: 'fix the coupon bug', origin: { kind: 'composer' }, isExpanded: true } as const
const REPLY = { text: '# Done\n\nFixed `pricing.js`.', isFirstOfReply: true } as const

function native(on: On) {
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['native content'] }))
}

function saves(on: On) {
  const saved: { key: string; value: unknown }[] = []
  on('config.set', ($, e) => {
    saved.push({ key: e.key, value: e.value })
    return { value: e.value }
  })
  return saved
}

test('prompts and replies are drawn in the default theme', async ($, on) => {
  native(on)
  for (const surface of SURFACES) {
    const prompt = await $.ui.mount({ plugin: 'lif-theme', component: 'UserMessage', surface, props: PROMPT })
    expect((await prompt.find({ type: 'Box' }))?.props.backgroundColor).toBe(THEMES['claude-warm'].prompt.bg)
    expect(await prompt.find({ type: 'Text', text: 'fix the coupon bug' })).toBeDefined()
    await prompt.unmount()
    const reply = await $.ui.mount({ plugin: 'lif-theme', component: 'AssistantMessage', surface, props: REPLY })
    expect((await reply.find({ type: 'Box' }))?.props.backgroundColor).toBe(THEMES['claude-warm'].reply.bg)
    expect((await reply.find({ type: 'Text', text: 'Done' }))?.props.color).toBe(THEMES['claude-warm'].markdown.heading)
    expect(await reply.find({ type: 'Text', text: 'native content' })).toBeUndefined()
    await reply.unmount()
  }
})

test('every kind of block draws on every surface', async ($, on) => {
  native(on)
  const text = '## Plan\n\nRun `ls`, **now**, *soon*, see [docs](https://x.dev) or [here](./a.md).\n\n- one\n  - nested\n1. two\n\n> said\n\n---\n\n```ts\nconst a = 1\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |'
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'lif-theme', component: 'AssistantMessage', surface, props: { ...REPLY, text, isSummary: true } })
    const c = THEMES['claude-warm'].markdown
    expect((await ui.find({ type: 'Text', text: /^ls$/ }))?.props.color).toBe(c.code)
    expect((await ui.find({ type: 'Text', text: /^now$/ }))?.props.color).toBe(c.bold)
    expect((await ui.find({ type: 'Text', text: /^docs$/ }))?.props.color).toBe(c.link)
    expect((await ui.find({ type: 'Link' }))?.props.href).toBe('https://x.dev')
    expect((await ui.find({ type: 'Code' }))?.props.source).toBe('const a = 1')
    expect((await ui.find({ type: 'Markdown' }))?.props.text).toMatch(/^\| a \| b \|/)
    expect(await ui.find({ type: 'Text', text: / · summary/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the theme setting picks the colours', { options: { theme: 'night-blue' } }, async ($, on) => {
  native(on)
  const reply = await $.ui.mount({ plugin: 'lif-theme', component: 'AssistantMessage', surface: 'terminal', props: REPLY })
  expect((await reply.find({ type: 'Box' }))?.props.backgroundColor).toBe(THEMES['night-blue'].reply.bg)
  await reply.unmount()
})

test('turned off, both rows are the engine\'s own', { options: { enabled: false } }, async ($, on) => {
  native(on)
  for (const surface of SURFACES) {
    for (const [component, props] of [['UserMessage', PROMPT], ['AssistantMessage', REPLY]] as const) {
      const ui = await $.ui.mount({ plugin: 'lif-theme', component, surface, props })
      expect(await ui.find({ type: 'Text', text: 'native content' })).toBeDefined()
      expect(await ui.find({ type: 'Box' })).toBeUndefined()
      await ui.unmount()
    }
  }
})

test('a task notification keeps the engine\'s row', async ($, on) => {
  native(on)
  const props = { ...PROMPT, origin: { kind: 'task-notification' }, task: { id: 't1' } } as never
  const ui = await $.ui.mount({ plugin: 'lif-theme', component: 'UserMessage', surface: 'terminal', props })
  expect(await ui.find({ type: 'Text', text: 'native content' })).toBeDefined()
  await ui.unmount()
})

test('the command saves the theme and the off switch as settings', async ($, on) => {
  const saved = saves(on)
  await $.command.run({ ...command, command: 'lif-theme', args: 'night-blue' })
  await $.command.run({ ...command, command: 'lif-theme', args: 'next' })
  await $.command.run({ ...command, command: 'lif-theme', args: 'off' })
  expect(saved).toEqual([
    { key: 'lif-theme.theme', value: 'night-blue' },
    { key: 'lif-theme.theme', value: 'night-blue' },
    { key: 'lif-theme.enabled', value: false },
  ])
})

test('an unknown theme saves nothing and names the real ones', async ($, on) => {
  const saved = saves(on)
  const out = await $.command.run({ ...command, command: 'lif-theme', args: 'neon' })
  expect(saved).toEqual([])
  expect(out.text).toMatch(/claude-warm, night-blue, titanium/)
})

test('markdown splits into blocks and spans', () => {
  expect(blocks('# Title\n\n- one\n1. two\n> said\n---\n```ts\nconst a = 1\n```\n| a |\n| - |\nplain')).toEqual([
    { kind: 'heading', spans: [{ kind: 'text', text: 'Title' }] },
    { kind: 'gap' },
    { kind: 'item', indent: 0, marker: '•', spans: [{ kind: 'text', text: 'one' }] },
    { kind: 'item', indent: 0, marker: '1.', spans: [{ kind: 'text', text: 'two' }] },
    { kind: 'quote', spans: [{ kind: 'text', text: 'said' }] },
    { kind: 'rule' },
    { kind: 'code', source: 'const a = 1', language: 'ts' },
    { kind: 'table', text: '| a |\n| - |' },
    { kind: 'para', spans: [{ kind: 'text', text: 'plain' }] },
  ])
  expect(spans('run `ls` in **bold** or *slant*, see [docs](https://x.dev)')).toEqual([
    { kind: 'text', text: 'run ' },
    { kind: 'code', text: 'ls' },
    { kind: 'text', text: ' in ' },
    { kind: 'bold', text: 'bold' },
    { kind: 'text', text: ' or ' },
    { kind: 'italic', text: 'slant' },
    { kind: 'text', text: ', see ' },
    { kind: 'link', text: 'docs', href: 'https://x.dev' },
  ])
})
