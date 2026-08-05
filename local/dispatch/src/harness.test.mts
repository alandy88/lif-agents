import { test } from "node:test";
import assert from "node:assert/strict";

import { adapters, launchArgs, resolveAdapter } from "./harness.mts";
import type { Harness } from "./types.mts";

test("resolveAdapter returns the verified claude adapter", () => {
  const adapter = resolveAdapter("claude");
  assert.equal(adapter.kind, "claude");
  assert.deepEqual(adapter.autonomyFlag, ["--dangerously-skip-permissions"]);
});

test("resolveAdapter refuses harnesses with no verified entry", () => {
  for (const harness of ["codex", "grok", "pi", "opencode"] as const) {
    assert.throws(
      () => resolveAdapter(harness),
      /no verified adapter/,
      `expected ${harness} to be refused until M3 verifies it`,
    );
  }
});

test("resolveAdapter refuses a harness name outside the union", () => {
  // kimi was cut in review; a stale caller naming it must be refused, not crash.
  assert.throws(() => resolveAdapter("kimi" as unknown as Harness), /no verified adapter/);
});

test("only claude is registered for M1", () => {
  assert.deepEqual(Object.keys(adapters), ["claude"]);
});

test("launchArgs includes the model and omits an unsupported effort", () => {
  const args = launchArgs(resolveAdapter("claude"), { model: "opus", effort: "xhigh" });
  assert.deepEqual(args, ["--dangerously-skip-permissions", "--model", "opus"]);
  assert.ok(!args.includes("xhigh"));
});

test("launchArgs with no options is autonomy only", () => {
  assert.deepEqual(launchArgs(resolveAdapter("claude")), ["--dangerously-skip-permissions"]);
});

test("launchArgs passes effort through for an adapter that supports it", () => {
  const args = launchArgs(
    { kind: "fake", autonomyFlag: ["--auto"], modelFlag: (m) => ["-m", m], effortFlag: (e) => ["--effort", e] },
    { model: "x", effort: "high" },
  );
  assert.deepEqual(args, ["--auto", "-m", "x", "--effort", "high"]);
});
