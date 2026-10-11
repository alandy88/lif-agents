import type { Elements, SessionRateLimit } from 'claude-code'

import type { LimitReading, StatusSnapshot } from '../types'

export const EMPTY_STATUS: StatusSnapshot = {
  cwd: null,
  branch: null,
  isDirty: false,
  contextPercent: null,
  fiveHour: null,
  sevenDay: null,
}

type Table = Pick<Elements['terminal'], 'Box' | 'Text'>
type Usage = { context: { percent?: number }; rateLimits: readonly SessionRateLimit[] }

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

const reading = (limits: readonly SessionRateLimit[], kind: string): LimitReading | null => {
  const found = limits.find(l => l.kind === kind)
  return found ? { percent: found.percentUsed, resetsAt: found.resetsAt } : null
}

export const withUsage = (s: StatusSnapshot, u: Usage): StatusSnapshot => ({
  ...s,
  contextPercent: u.context.percent ?? null,
  fiveHour: reading(u.rateLimits, 'five_hour'),
  sevenDay: reading(u.rateLimits, 'seven_day'),
})

/** Reads `git status --porcelain=v2 --branch`; any line that is not a header means uncommitted changes. */
export function parseGit(out: string): { branch: string | null; isDirty: boolean } {
  const lines = out.split('\n').filter(Boolean)
  const head = lines.find(l => l.startsWith('# branch.head '))?.slice('# branch.head '.length)
  return { branch: head ?? null, isDirty: lines.some(l => !l.startsWith('#')) }
}

export const tildify = (path: string, home: string | undefined): string =>
  home && (path === home || path.startsWith(home + '/')) ? '~' + path.slice(home.length) : path

/** Time left in a window: "2h10m" or "45m"; a day or more away, the weekday it resets. */
export function resetIn(resetsAt: string | undefined, now: number): string {
  const left = resetsAt ? Date.parse(resetsAt) - now : NaN
  if (!(left > 0)) return ''
  if (left >= DAY_MS) return WEEKDAYS[new Date(resetsAt!).getDay()]!
  const h = Math.floor(left / HOUR_MS)
  const m = Math.floor((left % HOUR_MS) / 60_000)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m`
}

const levelColor = (percent: number) => (percent >= 90 ? 'red' : percent >= 70 ? 'yellow' : undefined)
const ctxColor = (percent: number) => (percent > 30 ? 'red' : percent > 20 ? '#ff8700' : percent > 15 ? 'yellow' : undefined)

type Segment = { text: string; color?: string }

function segments(s: StatusSnapshot, columns: number, now: number, narrow: boolean): { meters: Segment[]; where: string } {
  const place = s.cwd ? (narrow ? s.cwd.split('/').filter(Boolean).pop() ?? s.cwd : s.cwd) : ''
  const where = [place, s.branch ? s.branch + (s.isDirty ? '*' : '') : ''].filter(Boolean).join(narrow ? ' ' : '  ')
  const meter = (label: string, r: LimitReading | null, withReset: boolean): Segment | null => {
    if (!r) return null
    const left = withReset ? resetIn(r.resetsAt, now) : ''
    return { text: `${label} ${Math.round(r.percent)}%${left ? ` (${left})` : ''}`, color: levelColor(r.percent) }
  }
  const withReset = !narrow && columns >= 96
  const ctx = Math.round(s.contextPercent ?? 0)
  const meters = [{ text: `ctx ${ctx}%`, color: ctxColor(ctx) }, meter('5h', s.fiveHour, withReset), meter('wk', s.sevenDay, withReset)]
  return { meters: meters.filter((x): x is Segment => x !== null), where }
}

/** One dim line: context and the two plan windows on the left, directory and branch on the right. */
export function StatusLine({ Box, Text }: Table, s: StatusSnapshot, columns: number, now: number, narrowAt: number) {
  const { meters, where } = segments(s, columns, now, columns < narrowAt)
  return (
    <Box flexDirection="row" justifyContent="space-between">
      <Box flexShrink={0}>
        <Text wrap="truncate-end">
          {meters.map((p, i) => (
            <Text key={String(i)} dimColor={!p.color} color={p.color}>
              {i > 0 ? ' · ' : ''}
              {p.text}
            </Text>
          ))}
        </Text>
      </Box>
      {where ? (
        <Box marginLeft={2}>
          <Text dimColor wrap="truncate-start">
            {where}
          </Text>
        </Box>
      ) : null}
    </Box>
  )
}
