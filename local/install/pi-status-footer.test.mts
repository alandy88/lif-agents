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
