import type { EngineInterface, Register } from 'claude-code'

import { Reply } from './markdown'
import { readConfig, isThemeName, THEME_NAMES, THEMES } from './themes'

const USAGE = '`/lif-theme <name>` switches, `/lif-theme next` cycles, `/lif-theme on` or `off` turns the boxes on or off.'

async function save($: EngineInterface, field: 'enabled' | 'theme', value: boolean | string, done: string) {
  const { deny } = await $.config.set({ key: `lif-theme.${field}`, value })
  return { text: deny ? `Not changed: ${deny}` : done }
}

export const register: Register = (on, options) => {
  // A change in /config, or one this module saves, reloads it with the new options.
  const config = readConfig(options)
  const theme = THEMES[config.theme]

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'lif-theme',
      description: 'Switch the message theme, or turn the themed boxes on or off',
      argumentHint: '[name | next | on | off]',
    })
    return next(e)
  })

  on('command.run', { command: 'lif-theme' }, async ($, e) => {
    const want = e.args.trim().toLowerCase()
    if (!want) {
      const list = THEME_NAMES.map(n => (n === config.theme ? `**${n}**` : `\`${n}\``)).join(' · ')
      return { text: `Themed messages: **${config.enabled ? 'on' : 'off'}**. Theme: ${list}\n\n${USAGE}` }
    }
    if (want === 'on' || want === 'off') return save($, 'enabled', want === 'on', `Themed messages are ${want}.`)
    const name = want === 'next' ? THEME_NAMES[(THEME_NAMES.indexOf(config.theme) + 1) % THEME_NAMES.length] : want
    if (!isThemeName(name)) return { text: `No theme \`${want}\`. Themes: ${THEME_NAMES.join(', ')}.\n\n${USAGE}` }
    return save($, 'theme', name, `Theme: **${name}**.${config.enabled ? '' : ' Themed messages are off: `/lif-theme on` shows it.'}`)
  })

  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    // Task notifications and other agents' messages keep the engine's rows.
    if (!config.enabled || e.props.task || e.props.from) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box backgroundColor={theme.prompt.bg} paddingX={2} paddingY={1} marginTop={1}>
        <Text color={theme.prompt.fg}>{e.props.text}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    if (!config.enabled || !e.props.text.trim()) return next(e)
    const t = $.ui.resolve(e)
    const { Box, Text } = t
    return (
      <Box backgroundColor={theme.reply.bg} flexDirection="column" paddingX={2} paddingY={1} marginTop={1}>
        {Reply(t, e.props.text, theme)}
        {e.props.isSummary ? <Text key="summary" dimColor> · summary</Text> : null}
      </Box>
    )
  })
}
