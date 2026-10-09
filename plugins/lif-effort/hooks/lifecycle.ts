import type { TurnStepInput } from 'claude-code'

import type { LifEffortSession } from '../types'
import type { Verdict } from './classify'
import { MODELS, modelKeyOf, type Config } from './config'

export const fresh = (): LifEffortSession => ({
  isAuto: true,
  isModelAuto: true,
  isEffortAuto: true,
  canPickModel: true,
  canBrief: true,
  model: null,
  effort: null,
  turn: null,
  reason: '',
  nativeModel: null,
  nativeEffort: null,
  phase: 'ready',
})

/** A /clear or handoff: a new selection cycle that keeps the person's Auto choices. */
export const nextCycle = (s: LifEffortSession): LifEffortSession => ({
  ...fresh(),
  isAuto: s.isAuto,
  isEffortAuto: s.isEffortAuto,
  nativeModel: s.nativeModel,
})

export const applyVerdict = (s: LifEffortSession, v: Verdict): LifEffortSession => ({
  ...s,
  ...(v.model ? { model: v.model } : {}),
  effort: v.effort,
  reason: v.reason,
})

/** The running turn keeps the effort it started with; later prompts only change the next turn. */
export const bindTurn = (s: LifEffortSession, turnId: string): LifEffortSession => ({
  ...s,
  turn: { id: turnId, effort: s.effort },
})

export const manualModel = (s: LifEffortSession, to: string): LifEffortSession => ({
  ...s,
  isModelAuto: false,
  canPickModel: false,
  model: null,
  nativeModel: to,
  // The new model may default to another effort: that is no manual effort change.
  nativeEffort: null,
})

/** The engine's effort on a main request; a change the plugin did not make is the person's. */
export function observeEffort(s: LifEffortSession, effort: TurnStepInput['effort']) {
  if (typeof effort !== 'string' || effort === s.nativeEffort) return { s, isManual: false }
  const isManual = s.nativeEffort !== null
  return {
    s: { ...s, nativeEffort: effort, ...(isManual ? { isEffortAuto: false, turn: null, effort: null } : {}) },
    isManual,
  }
}

export const isModelRouted = (s: LifEffortSession, config: Config) =>
  s.isAuto && config.autoModel && s.isModelAuto && s.model !== null

export const isEffortRouted = (s: LifEffortSession, config: Config) =>
  s.isAuto && config.autoEffort && s.isEffortAuto

/** What a main request is sent with. Subagent requests never come here. */
export function route(s: LifEffortSession, config: Config, e: TurnStepInput): TurnStepInput {
  if (!s.isAuto) return e
  const model = isModelRouted(s, config) ? MODELS[s.model!].id : e.model
  const chosen = s.turn?.id === e.turnId ? s.turn.effort : s.effort
  const effort = isEffortRouted(s, config) && chosen ? chosen : e.effort
  if (model === e.model && effort === e.effort && modelKeyOf(model) !== 'haiku') return e
  // Haiku takes no effort setting.
  return { ...e, model, effort: modelKeyOf(model) === 'haiku' ? undefined : effort }
}
