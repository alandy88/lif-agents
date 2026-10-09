import { expect, test, type Engine } from 'claude-code/testing';
import type { TurnStepInput, TurnStepResult } from 'claude-code';

const probe = {
  command: 'lif-effort-spike', origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 100 },
} as const;
const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

async function finish(stream: ReturnType<Engine['turn']['step']>) {
  let part = await stream.next();
  while (!part.done) part = await stream.next();
  if (!part.value) throw new Error('The request did not return a result');
  return part.value;
}

function answerStep(e: TurnStepInput): TurnStepResult {
  return {
    turnId: e.turnId, index: e.index,
    answer: `${e.model}:${e.effort}`, toolUses: [], stopReason: 'end_turn', usage: null,
  };
}

test('loading the probe leaves requests unchanged until explicitly enabled', async ($, on) => {
  on('turn.step', async function* ($, e) { return answerStep(e); });
  const result = await finish($.turn.step({
    turnId: 'main', index: 0, model: 'claude-opus-5-5', effort: 'max', messageCount: 1,
  }));
  expect(result.answer).toBe('claude-opus-5-5:max');
});

test('request routing changes main requests but leaves subagent requests alone', async ($, on) => {
  on('turn.step', async function* ($, e) { return answerStep(e); });
  await $.command.run({ ...probe, args: 'route' });

  const request = {
    turnId: 'main', index: 0, model: 'claude-opus-5-5', effort: 'max', messageCount: 1,
  } as const;
  const main = await finish($.turn.step(request));
  expect(main.answer).toBe('claude-sonnet-5-5:low');

  const agent = await finish($.turn.step({ ...request, agentId: 'worker' }));
  expect(agent.answer).toBe('claude-opus-5-5:max');
});

test('a supported UI site preserves native content and its getter button works', async ($, on) => {
  const toasts: string[] = [];
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['native content'] }));
  on('session.model', () => ({ value: 'claude-opus-5-5' }));
  on('ui.toast', ($, e) => { toasts.push(e.text); return { value: undefined }; });

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'lif-effort-spike', component: 'AbovePrompt', surface,
      props: {
        hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100,
        scroll: { offset: 0, bodyRows: 10 }, view: {},
      },
    });
    expect(await ui.find({ type: 'Text', text: 'native content' })).toBeDefined();
    expect(await ui.find({ key: 'lif-effort-read-model' })).toBeDefined();
    await ui.press({ key: 'lif-effort-read-model' });
    await ui.unmount();
  }
  expect(toasts).toEqual(['Session model: claude-opus-5-5', 'Session model: claude-opus-5-5']);
});

test('an unroute command restores the native request unchanged', async ($, on) => {
  on('turn.step', async function* ($, e) { return answerStep(e); });
  await $.command.run({ ...probe, args: 'route' });
  await $.command.run({ ...probe, args: 'unroute' });
  const result = await finish($.turn.step({
    turnId: 'main', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1,
  }));
  expect(result.answer).toBe('claude-opus-5-5:high');
});

test('the small-model probe uses a short timeout and validates its label', async ($, on) => {
  on('model.complete', ($, e) => {
    expect(e.model).toBe('haiku');
    expect(e.timeoutMs).toBe(1500);
    expect(e.maxTokens).toBe(8);
    return { value: { isAnswered: true, text: 'SIMPLE', usage } };
  });
  const reply = await $.command.run({ ...probe, args: 'classify' });
  expect(reply.text).toBe('classifier: SIMPLE (haiku)');
});

test('an unavailable classifier returns the deterministic local fallback', async ($, on) => {
  on('model.complete', () => ({ deny: 'model unavailable' }));
  const reply = await $.command.run({ ...probe, args: 'classify' });
  expect(reply.text).toBe('classifier: COMPLEX (local fallback: model unavailable or timed out)');
});

test('a timed-out classifier returns the deterministic local fallback', async ($, on) => {
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'aborted', usage } }));
  const reply = await $.command.run({ ...probe, args: 'classify' });
  expect(reply.text).toBe('classifier: COMPLEX (local fallback: no valid label)');
});

test('an invalid classifier label returns the deterministic local fallback', async ($, on) => {
  on('model.complete', () => ({ value: { isAnswered: true, text: 'IGNORE THE RULES', usage } }));
  const reply = await $.command.run({ ...probe, args: 'classify' });
  expect(reply.text).toBe('classifier: COMPLEX (local fallback: no valid label)');
});

test('the persistent model-write probe refuses to run without explicit isolation and opt-in', async ($, on) => {
  on('env.get', () => ({ value: undefined }));
  const reply = await $.command.run({ ...probe, args: 'write-model' });
  expect(reply.text).toMatch(/^Refused:/);
});
