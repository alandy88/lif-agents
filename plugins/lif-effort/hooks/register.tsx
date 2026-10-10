import { atom, read, update } from 'claude-code'
import type { EngineInterface, PromptSubmitInput, Register, SessionMessage, Timer } from 'claude-code'

import type { AgentRow, LifEffortSession, ModelKey, Phase } from '../types'
import { activityOf, agentRows, type AgentDetail } from './agents'
import {
  CLASSIFIER_MODEL,
  BRIEF_MAX_TOKENS,
  BRIEF_TIMEOUT_MS,
  CLASSIFIER_TIMEOUT_MS,
  briefRequest,
  classifierRequest,
  constrain,
  isContinuation,
  isSubstantive,
  parseBrief,
  parseVerdict,
  recentConversation,
  withModelFloor,
  type Verdict,
} from './classify'
import { modelKeyOf, readConfig, type Config } from './config'
import {
  applyVerdict,
  bindTurn,
  fresh,
  isEffortRouted,
  isModelRouted,
  manualModel,
  nextCycle,
  observeEffort,
  route,
} from './lifecycle'
import {
  COMPACT_SYSTEM,
  carriedTask,
  compactPrompt,
  continuationPrompt,
  datedHandoffName,
  handoffPrompt,
  isUsableReview,
  reviewPrompt,
  isUsableHandoff,
  isUsableSummary,
  renderTranscript,
  summaryMessage,
} from './summaries'
import { EMPTY_STATUS, StatusLine, parseGit, tildify, withUsage } from './status'
import { AGENTS_PANE, AgentsPane, Bar, NARROW_COLUMNS, effective, modeLabel } from './ui'

const session = atom({ plugin: 'lif-effort', key: 'session' } as const, fresh())
const agents = atom({ plugin: 'lif-effort', key: 'agents' } as const, [])
const status = atom({ plugin: 'lif-effort', key: 'status' } as const, EMPTY_STATUS)

const SESSIONS = 'sessions'
const KEEP_SESSIONS = 30
const CARRY = 'carry'
const CARRY_MS = 15 * 60_000
const AGENT_POLL_MS = 2000
const COMPACT_TIMEOUT_MS = 120_000
const CLASSIFIED_ORIGINS = new Set(['composer', 'bridge', 'sdk', 'scheduled-trigger'])

type Stored = Record<string, { at: number; s: LifEffortSession }>
// The store is shared by every session, so a carried task names the session it belongs to.
type Carry = { at: number; isAuto: boolean; isEffortAuto: boolean; task?: string; prompt?: string; session?: string; model?: ModelKey }

// Subagent model, effort and activity seen on their own requests and tool calls; "when available".
const details = new Map<string, AgentDetail>()
let agentTimer: Timer | undefined

const noteAgent = (id: string, detail: AgentDetail) => details.set(id, { ...details.get(id), ...detail })

async function save($: EngineInterface, s: LifEffortSession) {
  const id = await $.session.id()
  const all = { ...((await $.store.get(SESSIONS)) as Stored | undefined), [id]: { at: await $.clock.now(), s: { ...s, phase: 'ready' as const } } }
  const kept = Object.entries(all)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, KEEP_SESSIONS)
  await $.store.set(SESSIONS, Object.fromEntries(kept))
}

/** Every lasting change is kept per session id, so a resume or reload finds it. */
async function change($: EngineInterface, fn: (s: LifEffortSession) => LifEffortSession) {
  const s = await update($, session, fn)
  await save($, s).catch(() => undefined)
  return s
}

/** Directory and branch; a missing repository or a slow git leaves the branch empty. */
async function refreshGit($: EngineInterface) {
  const cwd = await $.session.cwd()
  const home = await $.env.get('HOME')
  let git: ReturnType<typeof parseGit> = { branch: null, isDirty: false }
  try {
    const r = await $.process.run(['git', '-c', 'core.quotePath=false', '--no-optional-locks', 'status', '--porcelain=v2', '--branch'], {
      cwd,
      timeoutMs: 2000,
    })
    if (r.exitCode === 0) git = parseGit(r.stdout)
  } catch {
    // git missing or too slow: show the directory alone
  }
  await update($, status, s => ({ ...s, cwd: tildify(cwd, home), ...git }))
}

const setPhase = ($: EngineInterface, phase: Phase) => update($, session, s => ({ ...s, phase }))

/** Loads this session's own selection; a resume into a session never seen here starts fresh. */
async function restore($: EngineInterface, isResume = false) {
  const id = await $.session.id()
  const stored = ((await $.store.get(SESSIONS)) as Stored | undefined)?.[id]?.s
  const nativeModel = await $.session.model().catch(() => null)
  if (stored) {
    await update($, session, () => ({ ...stored, phase: 'ready' as const, nativeModel }))
    return
  }
  const turns = await $.session.turns().catch(() => 0)
  // A session that already ran keeps its model: switching it now would forfeit its cache.
  await update($, session, s => {
    const base = isResume ? fresh() : s
    return { ...base, phase: 'ready' as const, nativeModel, canPickModel: base.canPickModel && turns === 0, canBrief: base.canBrief && turns === 0 }
  })
}

/** After a /clear: session.end already began the new cycle; this only carries the person's Auto choices over. */
async function startCycle($: EngineInterface) {
  const carry = (await $.store.get(CARRY)) as Carry | undefined
  const nativeModel = await $.session.model().catch(() => null)
  await change($, s => ({
    ...s,
    nativeModel,
    ...(carry ? { isAuto: carry.isAuto, isEffortAuto: carry.isEffortAuto } : {}),
  }))
}

/** A waiting handoff's task, taken once, by the first prompt of the new cycle. */
async function takeCarry($: EngineInterface): Promise<Carry | undefined> {
  const carry = (await $.store.get(CARRY)) as Carry | undefined
  if (!carry?.task || carry.session !== (await $.session.id()) || (await $.clock.now()) - carry.at > CARRY_MS) return undefined
  const { task: _task, prompt: _prompt, session: _session, model: _model, ...rest } = carry
  await $.store.set(CARRY, rest)
  return carry
}

// A log entry is drawn as one row, cut at 2000 characters, so each line gets its own.
const logLines = ($: EngineInterface, text: string) => {
  for (const line of text.split('\n')) $.ui.log(line)
}

const classifyFailed = ($: EngineInterface, reason: string) => {
  $.ui.log(`lif-effort: classifier gave no verdict (${reason}), keeping the current model and effort`)
  return null
}

/** One small Haiku call; null on any failure, so the caller leaves settings unchanged. */
async function classify($: EngineInterface, text: string, recent: string, pickModel: boolean, config: Config) {
  try {
    const reply = await $.model.complete({
      model: CLASSIFIER_MODEL,
      ...classifierRequest(text, recent, pickModel, config),
      effort: 'low',
      // Room for brief thinking ahead of the ~30-token verdict; unused tokens cost nothing.
      maxTokens: 400,
      timeoutMs: CLASSIFIER_TIMEOUT_MS,
    })
    if (!reply.isAnswered) return classifyFailed($, reply.reason)
    const verdict = parseVerdict(reply.text, pickModel)
    return verdict ? constrain(verdict, config) : classifyFailed($, `unreadable reply: ${reply.text.slice(0, 80)}`)
  } catch (error) {
    return classifyFailed($, String(error))
  }
}

/** Picks the session model (first substantive prompt) and the effort for the next turn. */
async function choose($: EngineInterface, text: string, config: Config): Promise<Verdict | null> {
  const s = await read($, session)
  const pickModel = config.autoModel && s.isModelAuto && s.canPickModel && isSubstantive(text)
  const pickEffort = config.autoEffort && s.isEffortAuto
  if (!s.isAuto || (!pickModel && !pickEffort)) return null
  // "continue" and the like keep the effort already chosen.
  if (!pickModel && isContinuation(text)) return null

  await setPhase($, 'classifying')
  let verdict: Verdict | null = null
  try {
    const recent = pickModel ? '' : recentConversation(((await $.session.messages().catch(() => [])) as SessionMessage[]) ?? [])
    verdict = await classify($, text, recent, pickModel, config)
  } finally {
    await change($, s => ({
      ...(verdict ? applyVerdict(s, verdict) : s),
      ...(pickModel ? { canPickModel: false } : {}),
      phase: 'ready',
    }))
  }
  return verdict
}

/** One Haiku call; null on any failure, so the prompt goes out as typed. */
async function brief($: EngineInterface, text: string) {
  try {
    const reply = await $.model.complete({
      model: CLASSIFIER_MODEL,
      ...briefRequest(text),
      effort: 'low',
      maxTokens: BRIEF_MAX_TOKENS,
      timeoutMs: BRIEF_TIMEOUT_MS,
    })
    return reply.isAnswered ? parseBrief(reply.text) : null
  } catch {
    return null
  }
}

async function onPrompt($: EngineInterface, e: PromptSubmitInput, config: Config) {
  // Notifications, peers and other plugins' prompts are not the person's requests.
  if (!CLASSIFIED_ORIGINS.has(e.origin.kind)) return
  const carry = await takeCarry($)
  const isFirst = (await read($, session)).canBrief && isSubstantive(e.text)
  if (isFirst) await change($, s => ({ ...s, canBrief: false }))
  await choose(
    $,
    carry ? `${carry.task}${e.text.trim() !== carry.prompt ? `\n\n${e.text}` : ''}` : e.text,
    withModelFloor(config, carry?.model),
  )
  // A handoff's carried task is already a brief.
  if (carry || !isFirst || !config.briefFirstPrompt) return
  await setPhase($, 'classifying')
  try {
    const context = await brief($, e.text)
    if (context) logLines($, `lif-effort brief:\n${context.slice(context.indexOf('\n\n') + 2)}`)
    return context
  } finally {
    await setPhase($, 'ready')
  }
}

async function toggleAuto($: EngineInterface) {
  const s = await change($, s =>
    s.isAuto && s.isEffortAuto ? { ...s, isAuto: false } : { ...s, isAuto: true, isEffortAuto: true },
  )
  return modeLabel(s)
}

async function compactNow($: EngineInterface, config: Config) {
  if ((await read($, session)).phase !== 'ready') return $.ui.toast('lif-effort: busy, try again in a moment')
  if (config.compactionModel === 'session') {
    const result = await $.session.compact().catch((error: unknown) => ({ skip: String(error) }))
    if (result.skip) $.ui.toast(`lif-effort: compaction did not run: ${result.skip}`)
    return
  }
  // The engine skips a plugin's own hooks for calls that plugin makes, so the Haiku compaction needs the person's /compact.
  const draft = await $.prompt.read().catch(() => ({ text: '' }))
  const filled = draft.text.trim() === '' && (await $.prompt.fill({ text: '/compact' }).catch(() => undefined))?.isFilled
  $.ui.toast(filled ? 'lif-effort: press Enter to compact with Haiku' : 'lif-effort: type /compact to compact with Haiku')
}

async function toggleAgents($: EngineInterface) {
  const panes = await $.ui.panes().catch(() => [])
  // A pane that waits undrawn is not up: the next press must seat it, not close it.
  if (panes.some(p => p.id === AGENTS_PANE && p.isPlaced)) return $.ui.close({ id: AGENTS_PANE })
  const opened = await $.ui.open({ id: AGENTS_PANE, title: 'Agents' })
  if (!opened.isPlaced) $.ui.toast(`lif-effort: agents panel not shown. ${opened.reason}`)
}

async function refreshAgents($: EngineInterface, config: Config) {
  const list = await $.agent.list()
  for (const id of details.keys()) if (!list.some(a => a.id === id)) details.delete(id)
  const rows = agentRows(list, details, config.agentVisibility)
  if (JSON.stringify(await read($, agents)) !== JSON.stringify(rows)) await update($, agents, () => rows)
}

async function repoState($: EngineInterface, cwd: string) {
  // Read-only git commands only: a handoff never changes the repository.
  const run = async (argv: string[]) => {
    try {
      const r = await $.process.run(argv, { cwd, timeoutMs: 5000 })
      return r.exitCode === 0 ? r.stdout.trim().slice(0, 3000) : ''
    } catch {
      return ''
    }
  }
  const commands = [
    ['git', 'status', '--short', '--branch'],
    ['git', 'log', '--oneline', '-5'],
    ['git', 'diff', '--stat'],
  ]
  const outputs = await Promise.all(commands.map(run))
  return commands
    .map((argv, i) => (outputs[i] ? `$ ${argv.join(' ')}\n${outputs[i]}` : ''))
    .filter(Boolean)
    .join('\n\n')
}

const ask = ($: EngineInterface, question: string, options: string[]) =>
  $.ui.ask(question, { options, header: 'lif-effort' }).catch(() => undefined)

/** Where to save: HANDOFF.md, or a dated name beside it rather than replacing it unasked. */
async function handoffFile($: EngineInterface, cwd: string): Promise<string | undefined> {
  if (!(await $.fs.exists(`${cwd}/HANDOFF.md`))) return 'HANDOFF.md'
  const choice = await ask($, 'HANDOFF.md already exists. Where should the new handoff go?', [
    'Keep both',
    'Overwrite',
    'Cancel',
  ])
  if (choice === 'Overwrite') return 'HANDOFF.md'
  if (choice === 'Keep both') return datedHandoffName(await $.clock.now())
  return undefined
}

/** A CAFE(S) review of the session so far, printed in the transcript; nothing is saved. */
async function review($: EngineInterface, focus?: string) {
  if ((await read($, session)).phase !== 'ready') return $.ui.toast('lif-effort: busy, try again in a moment')
  await setPhase($, 'review')
  try {
    const written = await $.model.fork({ prompt: reviewPrompt(focus) })
    if (!written.isAnswered) return $.ui.toast(`lif-effort: no review written (${written.reason})`)
    const text = written.text.trim()
    if (!isUsableReview(text)) return $.ui.toast('lif-effort: the review came back unusable; nothing was shown')
    logLines($, text)
  } finally {
    await setPhase($, 'ready')
  }
}

async function handoff($: EngineInterface, config: Config) {
  if ((await read($, session)).phase !== 'ready') return $.ui.toast('lif-effort: busy, try again in a moment')
  await setPhase($, 'handoff')
  try {
    const cwd = await $.session.cwd()
    const written = await $.model.fork({ prompt: handoffPrompt(await repoState($, cwd)) })
    if (!written.isAnswered) return $.ui.toast(`lif-effort: no handoff written (${written.reason})`)
    const text = written.text.trim()
    if (!isUsableHandoff(text)) return $.ui.toast('lif-effort: the handoff came back unusable; nothing was saved')
    const file = await handoffFile($, cwd)
    if (!file) return $.ui.toast('lif-effort: handoff cancelled; nothing was saved')
    try {
      await $.fs.write(`${cwd}/${file}`, `${text}\n`)
    } catch (error) {
      return $.ui.toast(`lif-effort: could not save ${file}: ${String(error).slice(0, 120)}`)
    }
    if (config.afterHandoff === 'save') return $.ui.toast(`lif-effort: saved ${file}`)
    const answer = await ask($, `Saved ${file}. Clear this conversation and start fresh from it?`, [
      'Start fresh',
      'Keep this conversation',
    ])
    if (answer !== 'Start fresh') return $.ui.toast(`lif-effort: saved ${file}; the conversation is kept`)

    const s = await read($, session)
    const prompt = continuationPrompt(file)
    const task = carriedTask(text)
    const model = isModelRouted(s, config) ? s.model! : modelKeyOf(s.nativeModel)
    const isWaiting = config.afterHandoff === 'wait'
    await $.store.set(CARRY, { at: await $.clock.now(), isAuto: s.isAuto, isEffortAuto: s.isEffortAuto } satisfies Carry)
    await $.command.run({ command: 'clear', args: '' })
    if (isWaiting) {
      // After the clear, $.session.id() is the new session's id.
      const carry = (await $.store.get(CARRY)) as Carry
      await $.store.set(CARRY, { ...carry, at: await $.clock.now(), task, prompt, session: await $.session.id(), ...(model ? { model } : {}) } satisfies Carry)
      await $.prompt.fill({ text: prompt })
      return
    }
    // The plugin's own prompt skips its own hooks: the carried task is classified here instead.
    await choose($, task, withModelFloor(config, model))
    await $.prompt.submit({ text: prompt, asUser: true })
  } finally {
    await setPhase($, 'ready')
  }
}

function statusText(s: LifEffortSession, config: Config) {
  const { model, effort } = effective(s, config)
  const modelAuto = !config.autoModel
    ? 'off in settings'
    : !s.isModelAuto
      ? 'off for this session (manual model change)'
      : s.model
        ? `picked ${s.model}`
        : s.canPickModel
          ? 'waiting for the first substantive prompt'
          : 'not picked; using the session model'
  const effortAuto = !config.autoEffort ? 'off in settings' : s.isEffortAuto ? 'on' : 'off (manual effort change)'
  return [
    `Requests use: ${model} · ${effort} (${modeLabel(s)})`,
    `App's own setting: ${s.nativeModel ?? 'unknown'} · ${s.nativeEffort ?? 'default effort'}`,
    `Automatic model: ${modelAuto}. Automatic effort: ${effortAuto}.`,
    isModelRouted(s, config) || isEffortRouted(s, config)
      ? 'lif-effort changes each request only; the app\'s model picker and status line still show its own setting.'
      : '',
    s.reason ? `Last reason: ${s.reason}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export const register: Register = (on, options) => {
  const config = readConfig(options)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'lif-effort',
      description: 'Model and effort automation: status, auto, handoff, review, agents. Compact with /compact.',
      argumentHint: 'status | auto [on|off] | handoff | review [focus] | agents',
    })
    await restore($)
    if (config.showStatus) {
      await $.session.usage().then(u => update($, status, s => withUsage(s, u))).catch(() => undefined)
      await refreshGit($).catch(() => undefined)
    }
    agentTimer?.cancel()
    agentTimer = $.clock.every(AGENT_POLL_MS, () => void refreshAgents($, config).catch(() => undefined))
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (config.showStatus) await update($, status, s => withUsage(s, e))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (config.showStatus) await refreshGit($).catch(() => undefined)
    return result
  })

  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    if (e.source === 'resume') await restore($, true)
    if (e.source === 'clear') await startCycle($)
    return result
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      const s = await read($, session)
      const carry = (await $.store.get(CARRY)) as Carry | undefined
      await $.store.set(CARRY, { ...carry, at: await $.clock.now(), isAuto: s.isAuto, isEffortAuto: s.isEffortAuto })
      await update($, session, nextCycle)
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const context = await onPrompt($, e, config).catch(() => setPhase($, 'ready'))
    return next(typeof context === 'string' ? { ...e, context: [...(e.context ?? []), context] } : e)
  })

  on('turn.start', async ($, e, next) => {
    await update($, session, s => bindTurn(s, e.turnId))
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      noteAgent(e.agentId, { model: e.model, ...(typeof e.effort === 'string' ? { effort: e.effort } : {}) })
      return yield* next(e)
    }
    const before = await read($, session)
    const { isManual } = observeEffort(before, e.effort)
    let s = before
    if (isManual || before.nativeEffort !== (e.effort ?? before.nativeEffort) || before.nativeModel !== e.model) {
      s = await change($, cur => ({ ...observeEffort(cur, e.effort).s, nativeModel: e.model }))
    }
    if (isManual) $.ui.toast('lif-effort: effort changed by hand, so automatic effort is off. Press the mode in the bar to turn it back on.')
    return yield* next(route(s, config, e))
  })

  on('classic.PostModelSwitch', async ($, e, next) => {
    const result = await next(e)
    if (e.source === 'command' || e.source === 'picker' || e.source === 'sdk') {
      await change($, s => manualModel(s, e.to_model))
    }
    return result
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) noteAgent(e.agentId, { activity: activityOf(e.tool, e as Record<string, unknown>) })
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    if (e.agentId !== undefined || config.compactionModel !== 'haiku' || e.messages.length === 0) return next(e)
    // A precomputed summary would come from the session model and go unused.
    if (e.trigger === 'precompute') return { skip: 'lif-effort compacts with Haiku when compaction is due' }
    await setPhase($, 'compacting')
    try {
      const reply = await $.model
        .complete({
          model: 'haiku',
          system: COMPACT_SYSTEM,
          prompt: compactPrompt(renderTranscript(e.messages), e.instructions),
          effort: 'medium',
          maxTokens: 12_000,
          timeoutMs: COMPACT_TIMEOUT_MS,
        })
        .catch(() => undefined)
      if (reply?.isAnswered && isUsableSummary(reply.text)) return { messages: [summaryMessage(reply.text)] }
      $.ui.toast('lif-effort: Haiku gave no usable summary, so the native compaction runs')
      return next(e)
    } finally {
      await setPhase($, 'ready')
    }
  })

  on('command.run', { command: 'lif-effort' }, async ($, e) => {
    const [action = 'status', value] = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (action === 'status') return { text: statusText(await read($, session), config) }
    if (action === 'auto') {
      if (value !== 'on' && value !== 'off') return { text: `Automation: ${await toggleAuto($)}` }
      const s = await change($, s => (value === 'on' ? { ...s, isAuto: true, isEffortAuto: true } : { ...s, isAuto: false }))
      return { text: `Automation: ${modeLabel(s)}` }
    }
    if (action === 'handoff') {
      $.clock.after(0, () => void handoff($, config))
      return { text: 'Writing a handoff.' }
    }
    if (action === 'review') {
      const focus = e.args.trim().replace(/^review\s*/i, '')
      $.clock.after(0, () => void review($, focus))
      return { text: 'Reviewing the session with CAFE(S).' }
    }
    if (action === 'agents') {
      await toggleAgents($)
      return { text: 'Toggled the agents panel.' }
    }
    return { text: 'Usage: /lif-effort status | auto [on|off] | handoff | review [focus] | agents. Compact with /compact.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const native = await next(e)
    if (e.props.hasSurvey) return native
    const { Box, Text, Button } = $.ui.resolve(e)
    const s = await read($, session)
    const rows = await read($, agents)
    const line = config.showStatus
      ? StatusLine({ Box, Text }, await read($, status), e.props.bodyColumns, await $.clock.now(), NARROW_COLUMNS)
      : null
    const bar = Bar({ Box, Text, Button }, s, rows.length, e.props.bodyColumns, config, {
      toggleAuto: () => void toggleAuto($),
      compact: () => void compactNow($, config),
      handoff: () => void $.clock.after(0, () => void handoff($, config)),
      review: () => void $.clock.after(0, () => void review($)),
      agents: () => void toggleAgents($),
    })
    return (
      <Box flexDirection="column">
        {native}
        {line}
        {bar}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: AGENTS_PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return AgentsPane({ Box, Text }, await read($, agents), Math.floor(((e.viewport?.rows ?? 24) - 2) / 2))
  })
}
