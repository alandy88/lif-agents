import type { Elements } from 'claude-code'

import type { Theme } from './themes'

type Table = Pick<Elements['terminal'], 'Box' | 'Text' | 'Link' | 'Code' | 'Markdown'>

export type Span = { kind: 'text' | 'code' | 'bold' | 'italic'; text: string } | { kind: 'link'; text: string; href: string }

export type Block =
  | { kind: 'heading' | 'para' | 'quote'; spans: Span[] }
  | { kind: 'item'; indent: number; marker: string; spans: Span[] }
  | { kind: 'code'; source: string; language?: string }
  | { kind: 'table'; text: string }
  | { kind: 'rule' }
  | { kind: 'gap' }

// `code`, **bold**, [label](url), *italic*, _italic_
const INLINE = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)|\*([^*\s][^*\n]*)\*|\b_([^_\n]+)_\b/g

export function spans(line: string): Span[] {
  const out: Span[] = []
  let at = 0
  for (const m of line.matchAll(INLINE)) {
    if (m.index > at) out.push({ kind: 'text', text: line.slice(at, m.index) })
    if (m[1] !== undefined) out.push({ kind: 'code', text: m[1] })
    else if (m[2] !== undefined) out.push({ kind: 'bold', text: m[2] })
    else if (m[3] !== undefined) out.push({ kind: 'link', text: m[3], href: m[4] ?? '' })
    else out.push({ kind: 'italic', text: m[5] ?? m[6] ?? '' })
    at = m.index + m[0].length
  }
  if (at < line.length) out.push({ kind: 'text', text: line.slice(at) })
  return out
}

export function blocks(text: string): Block[] {
  const lines = text.split('\n')
  const out: Block[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const fence = line.match(/^\s*(```|~~~)\s*(\S*)/)
    if (fence) {
      const body: string[] = []
      // an unclosed fence, as in a reply cut short, runs to the end
      while (++i < lines.length && !(lines[i] ?? '').trimStart().startsWith(fence[1] ?? '```')) body.push(lines[i] ?? '')
      out.push({ kind: 'code', source: body.join('\n'), ...(fence[2] ? { language: fence[2] } : {}) })
      continue
    }
    if (/^\s*\|/.test(line)) {
      const rows = [line]
      while (/^\s*\|/.test(lines[i + 1] ?? '')) rows.push(lines[++i] ?? '')
      out.push({ kind: 'table', text: rows.join('\n') })
      continue
    }
    if (!line.trim()) {
      if (out.length && out.at(-1)?.kind !== 'gap') out.push({ kind: 'gap' })
      continue
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    const item = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/)
    const quote = line.match(/^\s*>\s?(.*)$/)
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) out.push({ kind: 'rule' })
    else if (heading) out.push({ kind: 'heading', spans: spans(heading[1] ?? '') })
    else if (item) out.push({ kind: 'item', indent: (item[1] ?? '').length, marker: /\d/.test(item[2] ?? '') ? (item[2] ?? '') : '•', spans: spans(item[3] ?? '') })
    else if (quote) out.push({ kind: 'quote', spans: spans(quote[1] ?? '') })
    else out.push({ kind: 'para', spans: spans(line) })
  }
  if (out.at(-1)?.kind === 'gap') out.pop()
  return out
}

function Inline({ Text, Link }: Table, list: Span[], theme: Theme, key: string) {
  const c = theme.markdown
  return list.map((s, n) => {
    const k = `${key}-${n}`
    if (s.kind === 'code') return <Text key={k} color={c.code}>{s.text}</Text>
    if (s.kind === 'bold') return <Text key={k} bold color={c.bold}>{s.text}</Text>
    if (s.kind === 'italic') return <Text key={k} italic>{s.text}</Text>
    if (s.kind === 'link') {
      const label = <Text key={k} underline color={c.link}>{s.text}</Text>
      return /^(https?|file):/.test(s.href) ? <Link key={k} href={s.href}>{label}</Link> : label
    }
    return s.text
  })
}

/** A reply's markdown in the theme's colours. Code blocks and tables keep the engine's own drawing. */
export function Reply(t: Table, text: string, theme: Theme) {
  const { Box, Text, Code, Markdown } = t
  const c = theme.markdown
  const fg = theme.reply.fg
  return blocks(text).map((b, n) => {
    const k = `b${n}`
    if (b.kind === 'gap') return <Text key={k}> </Text>
    if (b.kind === 'rule') return <Text key={k} color={c.rule}>{'─'.repeat(24)}</Text>
    if (b.kind === 'code') return <Code key={k} source={b.source} language={b.language} />
    if (b.kind === 'table') return <Markdown key={k} text={b.text} />
    if (b.kind === 'heading') return <Text key={k} bold color={c.heading}>{Inline(t, b.spans, theme, k)}</Text>
    if (b.kind === 'quote') {
      return (
        <Box key={k} flexDirection="row">
          <Text color={c.quote}>│ </Text>
          <Text italic color={c.quote}>{Inline(t, b.spans, theme, k)}</Text>
        </Box>
      )
    }
    if (b.kind === 'item') {
      return (
        <Box key={k} flexDirection="row" paddingLeft={b.indent}>
          <Text color={c.bullet}>{b.marker} </Text>
          <Text color={fg}>{Inline(t, b.spans, theme, k)}</Text>
        </Box>
      )
    }
    return <Text key={k} color={fg}>{Inline(t, b.spans, theme, k)}</Text>
  })
}
