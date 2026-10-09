export type ModelKey = 'opus' | 'sonnet' | 'haiku'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type Phase = 'ready' | 'classifying' | 'compacting' | 'handoff'

export type LifEffortSession = {
  /** Master Auto control for this session. */
  isAuto: boolean
  /** Off after a manual model change, for the rest of the session. */
  isModelAuto: boolean
  /** Off after a manual effort change, until re-enabled. */
  isEffortAuto: boolean
  /** True until the first substantive prompt has been classified. */
  canPickModel: boolean
  /** The session model chosen automatically; null means the native one. */
  model: ModelKey | null
  /** The effort chosen for the next turn; null means the native one. */
  effort: Effort | null
  /** The effort bound to the running turn, so a queued prompt cannot change it. */
  turn: { id: string; effort: Effort | null } | null
  reason: string
  /** What the engine itself reports, before any request rewrite. */
  nativeModel: string | null
  nativeEffort: string | null
  phase: Phase
}

export type AgentRow = {
  id: string
  description: string
  type: string
  status: string
  model?: string
  effort?: string
  activity?: string
}

declare module 'claude-code' {
  interface PluginState {
    'lif-effort': {
      session: LifEffortSession
      agents: AgentRow[]
    }
  }
}
