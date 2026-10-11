import type { PluginOptions } from 'claude-code'

export type Palette = {
  heading: string
  code: string
  bold: string
  link: string
  bullet: string
  quote: string
  rule: string
}

export type Theme = {
  prompt: { bg: string; fg: string }
  reply: { bg: string; fg: string }
  markdown: Palette
}

// Each box sets its own text colour, so a light terminal never puts dark text on a dark box.
export const THEMES = {
  'claude-warm': {
    prompt: { bg: '#4a2a1c', fg: '#f5e6d3' },
    reply: { bg: '#1a1a1a', fg: '#e8ddd0' },
    markdown: {
      heading: '#d97757', code: '#e0a458', bold: '#f5e6d3', link: '#d97757',
      bullet: '#d97757', quote: '#a8998a', rule: '#3a3029',
    },
  },
  'night-blue': {
    prompt: { bg: '#14284b', fg: '#dbe7ff' },
    reply: { bg: '#0b0f17', fg: '#cdd6e4' },
    markdown: {
      heading: '#5aa9ff', code: '#4fd6e0', bold: '#eaf2ff', link: '#5aa9ff',
      bullet: '#4fd6e0', quote: '#7f8ba3', rule: '#1f2a3d',
    },
  },
  titanium: {
    prompt: { bg: '#2f4257', fg: '#e6ecf2' },
    reply: { bg: '#26292d', fg: '#d5d9de' },
    markdown: {
      heading: '#9db8d2', code: '#c9b27c', bold: '#f2f4f6', link: '#8fb4d9',
      bullet: '#9db8d2', quote: '#8b9199', rule: '#3b4046',
    },
  },
} as const satisfies Record<string, Theme>

export type ThemeName = keyof typeof THEMES
export const THEME_NAMES = Object.keys(THEMES) as ThemeName[]
export const DEFAULT_THEME: ThemeName = 'claude-warm'

export const isThemeName = (value: unknown): value is ThemeName => THEME_NAMES.includes(value as ThemeName)

export type Config = { enabled: boolean; theme: ThemeName }

export function readConfig(options: PluginOptions): Config {
  return {
    enabled: options.enabled !== false,
    theme: isThemeName(options.theme) ? options.theme : DEFAULT_THEME,
  }
}
