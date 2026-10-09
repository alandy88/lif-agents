import type { AgentInfo } from 'claude-code'

import type { AgentRow } from '../types'
import type { Config } from './config'

export type AgentDetail = { model?: string; effort?: string; activity?: string }

const ACTIVE = new Set(['pending', 'running', 'waiting', 'idle'])

/** One short line for what a subagent is doing: the tool and its most telling argument. */
export function activityOf(tool: string, input: Record<string, unknown>): string {
  const arg = ['file_path', 'path', 'pattern', 'command', 'url', 'query', 'description']
    .map(key => input[key])
    .find((value): value is string => typeof value === 'string' && value.trim() !== '')
  return (arg ? `${tool} ${arg.trim().split('\n')[0]}` : tool).slice(0, 80)
}

export function agentRows(
  agents: readonly AgentInfo[],
  details: ReadonlyMap<string, AgentDetail>,
  visibility: Config['agentVisibility'],
): AgentRow[] {
  return agents
    .filter(a => visibility === 'all' || ACTIVE.has(a.status))
    .map(a => ({ id: a.id, description: a.description, type: a.type, status: a.status, ...details.get(a.id) }))
}
