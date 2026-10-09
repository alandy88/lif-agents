import type { Elements } from 'claude-code'

import type { AgentRow, LifEffortSession } from '../types'
import { MODELS, modelKeyOf, type Config } from './config'
import { isEffortRouted, isModelRouted } from './lifecycle'

export const NARROW_COLUMNS = 64
export const AGENTS_PANE = 'lif-effort-agents'

type Table = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>
export type BarActions = { toggleAuto: () => void; compact: () => void; handoff: () => void; review: () => void; agents: () => void }

const PHASE_LABEL = { classifying: 'Classifying…', compacting: 'Compacting…', handoff: 'Writing handoff…', review: 'Reviewing session…' } as const
const title = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

/** The values the requests actually use, which may differ from the app's own pickers. */
export function effective(s: LifEffortSession, config: Config) {
  const key = isModelRouted(s, config) ? s.model! : modelKeyOf(s.nativeModel)
  const model = key ? MODELS[key].label : (s.nativeModel ?? 'Session model')
  const chosen = s.turn?.effort ?? s.effort
  const effort =
    key === 'haiku' ? 'No effort' : title((isEffortRouted(s, config) && chosen) || s.nativeEffort || 'default')
  return { model, effort }
}

export function modeLabel(s: LifEffortSession): string {
  if (s.phase !== 'ready') return PHASE_LABEL[s.phase]
  if (!s.isAuto) return 'Off'
  return s.isEffortAuto ? 'Auto' : 'Manual effort'
}

export function Bar(
  { Box, Text, Button }: Table,
  s: LifEffortSession,
  agents: number,
  columns: number,
  config: Config,
  act: BarActions,
) {
  const { model, effort } = effective(s, config)
  const reason = config.showReason && s.reason ? <Text dimColor> {s.reason}</Text> : null
  if (columns < NARROW_COLUMNS) {
    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          {model} · {effort} · {modeLabel(s)}
          {reason}
        </Text>
        <Text dimColor wrap="truncate-end">
          /compact · /lif-effort auto · handoff · review · agents
        </Text>
      </Box>
    )
  }
  return (
    <Box flexDirection="row" justifyContent="space-between">
      <Box flexDirection="row">
        <Text wrap="truncate-end">
          {model} · {effort} ·{' '}
        </Text>
        <Button key="auto" plain hotkey="m" onPress={act.toggleAuto}>
          {modeLabel(s)}
        </Button>
        {reason}
      </Box>
      <Box flexDirection="row" gap={1}>
        <Button key="compact" label="Compact" hotkey="c" onPress={act.compact} />
        <Button key="handoff" label="Handoff" hotkey="h" onPress={act.handoff} />
        <Button key="review" label="Review" hotkey="r" onPress={act.review} />
        <Button key="agents" label={`Agents (${agents})`} hotkey="a" onPress={act.agents} />
      </Box>
    </Box>
  )
}

export function AgentsPane({ Box, Text }: Pick<Table, 'Box' | 'Text'>, rows: readonly AgentRow[], rowsAvailable: number) {
  if (rows.length === 0) return <Text dimColor>No subagents to show.</Text>
  return (
    <Box flexDirection="column">
      {rows.slice(-Math.max(1, rowsAvailable)).map(a => (
        <Box key={a.id} flexDirection="column">
          <Text wrap="truncate-end">
            <Text bold>{a.status}</Text> {a.description || a.type}{' '}
            <Text dimColor>
              {a.type}
              {a.model ? ` · ${a.model}` : ''}
              {a.effort ? ` · ${a.effort}` : ''}
            </Text>
          </Text>
          {a.activity ? (
            <Text dimColor wrap="truncate-end">
              {'  '}
              {a.activity}
            </Text>
          ) : null}
        </Box>
      ))}
    </Box>
  )
}
