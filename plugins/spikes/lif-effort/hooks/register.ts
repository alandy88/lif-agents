import type { On } from 'claude-code';

// Unshipped issue-55 probe. Nothing changes the session until a probe command is run.
let route = false;

export function register(on: On) {
  // Keep this matcher to check the installed engine rather than a guessed API.
  // On 2.1.295 validation warns that the component doesn't exist.
  // @ts-expect-error Deliberate negative probe; re-evaluate the gate when this site becomes typed.
  on('ui.render', { component: 'PromptActions' }, ($, e, next) => next(e));

  // Positive control: a real clickable button at a supported site. This is NOT
  // the requested topRow and is not a replacement for the failed core gate.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { Box, Text, Button } = $.ui.resolve(e);
    return Box({ flexDirection: 'column', children: [
      await next(e),
      Text({ children: ['lif-effort compatibility probe (not production controls)'] }),
      Button({ key: 'lif-effort-read-model', children: ['Read session model'], onPress: async () => {
        await $.ui.toast(`Session model: ${await $.session.model()}`);
      } }),
    ] });
  });

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'lif-effort-spike',
      description: 'Issue 55 API probe: report, route, unroute, classify, write-model',
    });
    return next(e);
  });

  on('command.run', { command: 'lif-effort-spike' }, async ($, e) => {
    const action = e.args.trim() || 'report';
    if (action === 'route' || action === 'unroute') {
      route = action === 'route';
      return { text: route
        ? 'PROBE: main requests will use claude-sonnet-5-5 / low; native session settings are unchanged.'
        : 'PROBE: main requests pass through unchanged.' };
    }
    if (action === 'classify') {
      try {
        const reply = await $.model.complete({
          model: 'haiku', prompt: 'Classify the greeting "hello". Answer only SIMPLE or COMPLEX.',
          maxTokens: 8, timeoutMs: 1500,
        });
        const label = reply.isAnswered ? reply.text.trim() : undefined;
        if (label === undefined || !['SIMPLE', 'COMPLEX'].includes(label)) {
          return { text: 'classifier: COMPLEX (local fallback: no valid label)' };
        }
        return { text: `classifier: ${label} (haiku)` };
      } catch {
        return { text: 'classifier: COMPLEX (local fallback: model unavailable or timed out)' };
      }
    }
    if (action === 'write-model') {
      // This probe deliberately exercises the persistent writer. Require an explicit
      // opt-in AND a separate config directory; never run it against ~/.claude.
      const optIn = await $.env.get('LIF_EFFORT_SPIKE_ALLOW_SETTINGS_WRITE');
      const isolated = await $.env.get('CLAUDE_CONFIG_DIR');
      if (optIn !== '1' || !isolated) {
        return { text: 'Refused: write-model requires an isolated CLAUDE_CONFIG_DIR and LIF_EFFORT_SPIKE_ALLOW_SETTINGS_WRITE=1.' };
      }
      const before = await $.session.model();
      const result = await $.config.set({ key: 'model', value: 'sonnet' });
      const after = await $.session.model();
      return { text: JSON.stringify({ before, result, after }, null, 2) };
    }
    if (action !== 'report') return { text: 'Use report, route, unroute, classify, or write-model.' };

    const model = await $.session.model();
    const version = await $.session.version();
    const rows = await $.config.list();
    return { text: JSON.stringify({
      version, model,
      modelRow: rows.find(row => row.key === 'model'),
      effortRows: rows.filter(row => /effort/i.test(row.key)),
      routing: route,
    }, null, 2) };
  });

  // Supported, but this changes API requests rather than the native model/effort
  // controls. It is a candidate for a revised design, not a substitute for the gate.
  on('turn.step', async function* ($, e, next) {
    return yield* next(route && e.agentId === undefined
      ? { ...e, model: 'claude-sonnet-5-5', effort: 'low' }
      : e);
  });
}
