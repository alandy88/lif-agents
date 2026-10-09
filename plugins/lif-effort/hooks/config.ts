import type { PluginOptions } from 'claude-code'

import type { Effort, ModelKey } from '../types'

export const MODELS: Record<ModelKey, { id: string; label: string; rank: number }> = {
  haiku: { id: 'claude-haiku-5-5', label: 'Haiku 5.5', rank: 0 },
  sonnet: { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', rank: 1 },
  opus: { id: 'claude-opus-5-5', label: 'Opus 5.5', rank: 2 },
}
export const MODEL_KEYS = Object.keys(MODELS) as ModelKey[]
export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

export type Config = {
  autoModel: boolean
  allowedModels: ModelKey[]
  autoEffort: boolean
  effortFloor: Effort
  effortCeiling: Effort
  effortPreference: 'cheaper' | 'balanced' | 'deeper'
  compactionModel: 'haiku' | 'session'
  afterHandoff: 'continue' | 'wait' | 'save'
  agentVisibility: 'active' | 'all'
  showReason: boolean
  briefFirstPrompt: boolean
  showStatus: boolean
}

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback

export function readConfig(options: PluginOptions): Config {
  const allowed = String(options.allowedModels ?? '')
    .split(',')
    .filter((key): key is ModelKey => key in MODELS)
  return {
    autoModel: options.autoModel !== false,
    allowedModels: allowed.length ? allowed : [...MODEL_KEYS],
    autoEffort: options.autoEffort !== false,
    effortFloor: pick(options.effortFloor, EFFORTS, 'low'),
    effortCeiling: pick(options.effortCeiling, EFFORTS, 'xhigh'),
    effortPreference: pick(options.effortPreference, ['cheaper', 'balanced', 'deeper'] as const, 'balanced'),
    compactionModel: pick(options.compactionModel, ['haiku', 'session'] as const, 'haiku'),
    afterHandoff: pick(options.afterHandoff, ['continue', 'wait', 'save'] as const, 'wait'),
    agentVisibility: pick(options.agentVisibility, ['active', 'all'] as const, 'active'),
    showReason: options.showReason === true,
    briefFirstPrompt: options.briefFirstPrompt !== false,
    showStatus: options.showStatus !== false,
  }
}

export const modelKeyOf = (id: string | null | undefined): ModelKey | undefined =>
  MODEL_KEYS.find(key => id?.includes(key))
