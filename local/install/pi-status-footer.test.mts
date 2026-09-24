// The Pi runtime supplies these packages globally, not as lif-agents
// dependencies. Load the tracked TypeScript extension with a tiny TUI double so
// the pure parsing and rendering behavior is tested without touching Pi or
// quota credentials.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SOURCE = join(fileURLToPath(new URL("..", import.meta.url)), "pi/extensions/pi-status-footer.ts");
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]/g;

function visibleWidth(value: string): number {
  return value.replace(ANSI, "").length;
}

function truncateToWidth(value: string, width: number, ellipsis = "..."): string {
  if (width <= 0) return "";
  if (visibleWidth(value) <= width) return value;
  const suffix = ellipsis.slice(0, width);
  const budget = Math.max(0, width - visibleWidth(suffix));
  let result = "";
  let seen = 0;
  let index = 0;
  while (index < value.length && seen < budget) {
    ANSI.lastIndex = index;
    const match = ANSI.exec(value);
    if (match?.index === index) {
      result += match[0];
      index += match[0].length;
      continue;
    }
    result += value[index];
    index++;
    seen++;
  }
  return result + suffix;
}

type ThemeCall = { token: string; text: string };

async function loadFooter(): Promise<Record<string, any>> {
  const root = mkdtempSync(join(tmpdir(), "pi-footer-test-"));
  const modulePath = join(root, "pi-status-footer.ts");
  const source = readFileSync(SOURCE, "utf8").replace(
    'import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";',
    "const { truncateToWidth, visibleWidth } = globalThis.__footerTui;",
  );
  writeFileSync(modulePath, source);
  try {
    return (await import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`)) as Record<string, any>;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

(globalThis as any).__footerTui = { truncateToWidth, visibleWidth };
const footer = await loadFooter();

function theme(calls: ThemeCall[]): { fg(token: string, text: string): string } {
  return {
    fg(token: string, text: string) {
      calls.push({ token, text });
      return `\x1b[38;5;${calls.length}m${text}\x1b[39m`;
    },
  };
}

function report(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 3,
    account: { id: "must-not-survive" },
    sourceAttempts: [{ credential: "secret", error: "private" }],
    providers: [
      {
        provider: "claude",
        state: { status: "fresh", stale: false, error: "private" },
        windows: [
          { id: "five_hour", kind: "session", percentRemaining: 82 },
          { id: "weekly", kind: "weekly", percentRemaining: 61 },
        ],
        quotaSemantics: {
          effectiveAvailability: [
            { scope: "model:claude-sonnet", status: "known", boundedBy: ["weekly"] },
          ],
        },
      },
    ],
    ...overrides,
  });
}

test("quota parsing reduces reports to non-secret display fields", () => {
  const parsed = footer.parseQuotaReport(report());
  assert.deepEqual(parsed, {
    providers: [
      {
        provider: "claude",
        stateStatus: "fresh",
        stale: false,
        windows: [{ id: "five_hour", kind: "session", percentRemaining: 82 }, { id: "weekly", kind: "weekly", percentRemaining: 61 }],
        availability: [{ scope: "model:claude-sonnet", status: "known", boundedBy: ["weekly"] }],
      },
    ],
  });
  assert.equal(JSON.stringify(parsed).includes("must-not-survive"), false);
  assert.equal(footer.parseQuotaReport("not json"), undefined);
});

test("current quota-axi schema exposes the applicable weekly window", () => {
  const parsed = footer.parseQuotaReport(report({ schemaVersion: 5 }));
  const selected = footer.selectQuota(parsed, { provider: "anthropic", id: "claude-sonnet" });
  assert.deepEqual(selected.weekly, { id: "weekly", kind: "weekly", percentRemaining: 61 });
});

test("selection hides an absent five-hour quota and chooses the applicable weekly window", () => {
  const parsed = footer.parseQuotaReport(
    report({
      providers: [
        {
          provider: "claude",
          state: { status: "fresh", stale: false },
          windows: [
            { id: "weekly-low", kind: "weekly", percentRemaining: 28 },
            { id: "weekly-high", kind: "weekly", percentRemaining: 74 },
          ],
          quotaSemantics: {
            effectiveAvailability: [
              { scope: "all_models", status: "known", boundedBy: ["weekly-low", "weekly-high"] },
            ],
          },
        },
      ],
    }),
  );
  const selected = footer.selectQuota(parsed, { provider: "anthropic", id: "claude-sonnet" });
  assert.equal(selected.fiveHour, undefined);
  assert.deepEqual(selected.weekly, { id: "weekly-low", kind: "weekly", percentRemaining: 28 });
});

test("exact model quota scope wins over broad account scope", () => {
  const parsed = footer.parseQuotaReport(
    report({
      providers: [
        {
          provider: "claude",
          state: { status: "fresh", stale: false },
          windows: [
            { id: "broad-week", kind: "weekly", percentRemaining: 20 },
            { id: "exact-week", kind: "weekly", percentRemaining: 80 },
          ],
          quotaSemantics: {
            effectiveAvailability: [
              { scope: "all_models", status: "known", boundedBy: ["broad-week"] },
              { scope: "model:claude-sonnet", status: "known", boundedBy: ["exact-week"] },
            ],
          },
        },
      ],
    }),
  );
  const selected = footer.selectQuota(parsed, { provider: "anthropic", id: "claude-sonnet" });
  assert.equal(selected.weekly?.id, "exact-week");
});

test("footer shows completed prefill and decode throughput as In and Out", () => {
  const speed = footer.calculateInferenceSpeed(
    { requestStartedAt: 1_000, firstOutputAt: 3_000, completedAt: 5_000 },
    { input: 600, cacheRead: 300, cacheWrite: 100, output: 120 },
  );
  assert.deepEqual(speed, { inputTokensPerSecond: 500, outputTokensPerSecond: 60 });

  const line = footer.formatFooterLine(
    {
      modelId: "claude-sonnet",
      thinkingLevel: "high",
      context: { tokens: 42_000, contextWindow: 100_000, percent: 42 },
      quota: { weekly: { id: "week", kind: "weekly", percentRemaining: 40 } },
      speed,
    },
    theme([]),
    160,
  );
  assert.match(line, /In 500t\/s/);
  assert.match(line, /Out 60t\/s/);
});

test("footer uses semantic theme colors and fits a narrow terminal", () => {
  const calls: ThemeCall[] = [];
  const line = footer.formatFooterLine(
    {
      modelId: "anthropic/claude-sonnet-very-long-model-id",
      thinkingLevel: "high",
      context: { tokens: 42_000, contextWindow: 100_000, percent: 42 },
      quota: {
        fiveHour: { id: "five", kind: "session", percentRemaining: 82 },
        weekly: { id: "week", kind: "weekly", percentRemaining: 40 },
      },
    },
    theme(calls),
    44,
  );
  assert.ok(visibleWidth(line) <= 44);
  assert.match(line, /high/);
  assert.match(line, /ctx 42% 42k\/100k/);
  assert.match(line, /5h 82%/);
  assert.match(line, /week 40%/);
  assert.ok(calls.some((call) => call.token === "borderAccent"));
  assert.ok(calls.some((call) => call.token === "thinkingHigh"));
  assert.ok(calls.some((call) => call.token === "success"));
  assert.ok(calls.some((call) => call.token === "warning"));
});

test("live provider switches fetch monthly usage once and refresh Codex quotas", async () => {
  const handlers: Record<string, Function> = {};
  let component: any;
  let requests = 0;
  let quotaRequests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    requests++;
    return { ok: true, json: async () => ({ extra_usage: { is_enabled: true, used_credits: 450 } }) };
  }) as any;
  const ctx: any = {
    mode: "tui", model: { provider: "anthropic", id: "opus" },
    modelRegistry: { isUsingOAuth: () => true, getApiKeyForProvider: async () => "test-token" },
    sessionManager: { getEntries: () => [] }, getContextUsage: () => undefined,
    ui: { setFooter(factory: any) { if (factory) component = factory({ requestRender() {} }, theme([]), { getExtensionStatuses: () => new Map() }); } },
  };
  footer.default({
    on(name: string, handler: Function) { handlers[name] = handler; },
    getThinkingLevel: () => "high",
    exec: async () => { quotaRequests++; return { code: 0, stdout: report() }; },
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  try {
    handlers.session_start({}, ctx);
    await settle();
    assert.match(component.render(200)[0], /Month \$4\.50/);
    ctx.model = { provider: "openai-codex", id: "sol" };
    handlers.model_select({}, ctx);
    await settle();
    assert.doesNotMatch(component.render(200)[0], /Month|Session/);
    assert.equal(quotaRequests, 1);
    ctx.model = { provider: "anthropic", id: "sonnet" };
    handlers.model_select({}, ctx);
    await settle();
    assert.match(component.render(200)[0], /Month \$4\.50/);
    assert.equal(requests, 1);
    handlers.session_shutdown({}, ctx);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("monthly spend survives an idle redraw and failed refresh", async () => {
  const handlers: Record<string, Function> = {};
  let component: any;
  let requests = 0;
  let failure: "network" | "http" | undefined;
  let enabled = true;
  let now = Date.parse("2026-09-15T12:00:00Z");
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;
  Date.now = () => now;
  globalThis.fetch = (async () => {
    requests++;
    if (failure === "network") throw new Error("temporary failure");
    return { ok: failure !== "http", json: async () => ({ extra_usage: { is_enabled: enabled, used_credits: requests * 450 } }) };
  }) as any;
  const ctx: any = {
    mode: "tui", model: { provider: "anthropic", id: "opus" },
    modelRegistry: { isUsingOAuth: () => true, getApiKeyForProvider: async () => "test-token" },
    sessionManager: { getEntries: () => [] }, getContextUsage: () => undefined,
    ui: { setFooter(factory: any) { if (factory) component = factory({ requestRender() {} }, theme([]), { getExtensionStatuses: () => new Map() }); } },
  };
  footer.default({
    on(name: string, handler: Function) { handlers[name] = handler; },
    getThinkingLevel: () => "high",
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  try {
    handlers.session_start({}, ctx);
    await settle();
    assert.match(component.render(200)[0], /Month \$4\.50/);
    now += 300_001;
    failure = "network";
    assert.match(component.render(200)[0], /Month \$4\.50 stale/);
    await settle();
    assert.match(component.render(200)[0], /Month \$4\.50 stale/);
    assert.equal(requests, 2);
    for (let i = 0; i < 10; i++) component.render(200);
    await settle();
    assert.equal(requests, 2);
    now += 300_001;
    failure = undefined;
    component.render(200);
    await settle();
    assert.match(component.render(200)[0], /Month \$13\.50/);
    assert.doesNotMatch(component.render(200)[0], /stale/);
    now += 300_001;
    failure = "http";
    component.render(200);
    await settle();
    assert.match(component.render(200)[0], /Month \$13\.50 stale/);
    now = Date.parse("2026-10-01T00:00:00Z");
    assert.match(component.render(200)[0], /Month unavailable/);
    await settle();
    assert.match(component.render(200)[0], /Month unavailable/);
    now += 300_001;
    failure = undefined;
    component.render(200);
    await settle();
    assert.match(component.render(200)[0], /Month \$27\.00/);
    now += 300_001;
    enabled = false;
    component.render(200);
    await settle();
    assert.match(component.render(200)[0], /Month unavailable/);
  } finally {
    handlers.session_shutdown({}, ctx);
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  }
});

test("Claude session cost excludes Codex and survives model switches", () => {
  const message = (provider: string, total: number) => ({ type: "message", message: { role: "assistant", provider, usage: { cost: { total } } } });
  assert.equal(footer.claudeSessionCost([message("anthropic", 1), message("openai-codex", 20), message("anthropic", 2)]), 3);
  assert.equal(footer.claudeSessionCost([]), 0);
  assert.equal(footer.claudeSessionCost([{ type: "message", message: { role: "assistant", provider: "anthropic" } }]), undefined);
});

test("monthly credits use declared precision and reject unavailable data", () => {
  const extra = (values: object) => ({ extra_usage: { is_enabled: true, used_credits: 1234, ...values } });
  assert.equal(footer.parseMonthlySpend(extra({})), 12.34);
  assert.equal(footer.parseMonthlySpend(extra({ decimal_places: 3 })), 1.234);
  assert.equal(footer.parseMonthlySpend(extra({ used_credits: 0 })), 0);
  for (const value of [null, {}, extra({ is_enabled: false }), extra({ used_credits: -1 }), extra({ decimal_places: null })]) {
    assert.equal(footer.parseMonthlySpend(value), undefined);
  }
});

test("switching providers replaces quota with Claude spend without leaking values", () => {
  const snapshot = { modelId: "opus", thinkingLevel: "high", context: undefined,
    quota: { fiveHour: { percentRemaining: 80 }, weekly: { percentRemaining: 60 } },
    claudeSessionUsd: 1.25, claudeMonthUsd: 23.45 };
  for (const provider of ["anthropic", "openai-codex", "anthropic"]) {
    const line = footer.formatFooterLine({ ...snapshot, provider }, theme([]), 200).replace(ANSI, "");
    if (provider === "anthropic") {
      assert.match(line, /Session \$1\.25.*Month \$23\.45/);
      assert.doesNotMatch(line, /week|5h/);
    } else {
      assert.match(line, /5h 80% left.*week 60% left/);
      assert.doesNotMatch(line, /Session|Month/);
    }
  }
  const unavailable = footer.formatFooterLine({ ...snapshot, provider: "anthropic", claudeMonthUsd: undefined }, theme([]), 200);
  assert.match(unavailable, /Month unavailable/);
  for (const width of [0, 20, 60, 100]) {
    assert.ok(visibleWidth(footer.formatFooterLine({ ...snapshot, provider: "anthropic" }, theme([]), width)) <= width);
  }
});

test("footer omits the five-hour segment when selection has no five-hour window", () => {
  const line = footer.formatFooterLine(
    {
      modelId: "claude-sonnet",
      thinkingLevel: "low",
      context: { tokens: 1_000, contextWindow: 10_000, percent: 10 },
      quota: { weekly: { id: "week", kind: "weekly", percentRemaining: 90 } },
    },
    theme([]),
    120,
  );
  assert.equal(line.includes("5h"), false);
  assert.match(line, /week 90% left/);
});

test("footer renders extension statuses only when present and respects width", () => {
  const handlers: Record<string, Function> = {};
  const statuses = new Map<string, string>();
  let rendered: any;
  const ctx = {
    mode: "tui", model: undefined, getContextUsage: () => undefined,
    ui: { setFooter(factory: any) {
      if (factory) rendered = factory({ requestRender() {} }, theme([]), { getExtensionStatuses: () => statuses });
    } },
  };
  footer.default({
    on(name: string, handler: Function) { handlers[name] = handler; },
    getThinkingLevel: () => "off",
    exec: async () => ({ code: 1, stdout: "" }),
  });
  handlers.session_start!({}, ctx);
  assert.equal(rendered.render(80).length, 1);
  statuses.set("lif-quiet-tools", "Tools: 1 failed · /quiet-tools off");
  assert.match(rendered.render(80)[1], /Tools: 1 failed/);
  assert.ok(rendered.render(8).every((line: string) => visibleWidth(line) <= 8));
  statuses.clear();
  assert.equal(rendered.render(80).length, 1);
  handlers.session_shutdown!({}, ctx);
});
