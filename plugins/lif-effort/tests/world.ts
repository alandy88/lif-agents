import { mock, type Engine } from 'claude-code/testing'
import type { AgentInfo, On, PromptOrigin, TurnStepInput, TurnStepResult } from 'claude-code'

export const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
export const composer: PromptOrigin = { kind: 'composer' }
export const command = { origin: composer, presentation: { isFullscreen: false, columns: 100 } } as const
export const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
} as const

type WorldOptions = { id?: string; model?: string; turns?: number; store?: Record<string, unknown>; agents?: AgentInfo[] }

/** The engine beneath the plugin: a session, a clock, a store, toasts, and requests answered as model:effort. */
export function world(on: On, options: WorldOptions = {}) {
  let id = options.id ?? 's1'
  mock.store(on, options.store)
  const clock = mock.clock(on)
  const toasts: string[] = []
  const classifier: { prompt: string; system: string; model: string; timeoutMs?: number }[] = []
  on('session.id', () => ({ value: id }))
  on('session.model', () => ({ value: options.model ?? 'claude-opus-5-5' }))
  on('session.turns', () => ({ value: options.turns ?? 0 }))
  on('session.messages', () => ({ value: [] }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('agent.list', () => ({ value: options.agents ?? [] }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('classic.SessionStart', () => ({}))
  on('classic.PostModelSwitch', () => ({}))
  let reply: string | null = null
  let briefReply: string | null = null
  on('model.complete', ($, e) => {
    classifier.push({ prompt: e.prompt, system: e.system ?? '', model: e.model, timeoutMs: e.timeoutMs })
    const text = e.system?.includes('task brief') ? briefReply : reply
    return { value: text === null ? { isAnswered: false, reason: 'aborted', usage } : { isAnswered: true, text, usage } }
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  const submitted: string[] = []
  const contexts: (readonly string[] | undefined)[] = []
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    contexts.push(e.context)
    return { text: e.text }
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e): AsyncGenerator<never, TurnStepResult> {
    return { turnId: e.turnId, index: e.index, answer: `${e.model}:${e.effort ?? 'none'}`, toolUses: [], stopReason: 'end_turn', usage: null }
  })
  return {
    clock,
    toasts,
    submitted,
    contexts,
    classifier,
    setId: (next: string) => (id = next),
    /** Answers every later model.complete with this text, or times out on null. */
    judge: (text: string | null) => (reply = text),
    /** Answers the task-brief call with this text, or times out on null. */
    brief: (text: string | null) => (briefReply = text),
  }
}

export const start = ($: Engine) => $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

export async function prompt($: Engine, text: string, turnId?: string) {
  await $.prompt.submit({ text, origin: composer, wait: false, ...(turnId ? { turnId } : {}) })
}

/** One main request of a turn: what model and effort it was actually sent with. */
export async function step($: Engine, turnId: string, extra: Partial<TurnStepInput> = {}) {
  const stream = $.turn.step({ turnId, index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1, ...extra })
  let part = await stream.next()
  while (!part.done) part = await stream.next()
  return part.value.answer
}

export async function turn($: Engine, text: string, turnId: string, extra: Partial<TurnStepInput> = {}) {
  await prompt($, text)
  await $.turn.start({ text, turnId })
  return step($, turnId, extra)
}
