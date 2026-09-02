import assert from "node:assert/strict";
import { test } from "node:test";

import { agentFlags, backendName, shellQuote, worktreeName } from "./backend.mts";

test("worktreeName appends the clock time", () => {
  assert.equal(
    worktreeName("fix-bug", new Date(2026, 8, 2, 9, 5, 6, 7)),
    "fix-bug-20260902-090506-007",
  );
});

test("backendName: flag beats env beats HERDR_ENV, and orca is the fallback", () => {
  assert.equal(backendName({ LIF_HUB_BACKEND: "orca", HERDR_ENV: "1" }, "herdr"), "herdr");
  assert.equal(backendName({ LIF_HUB_BACKEND: "orca", HERDR_ENV: "1" }), "orca");
  assert.equal(backendName({ HERDR_ENV: "1" }), "herdr");
  assert.equal(backendName({}), "orca");
  assert.throws(() => backendName({ LIF_HUB_BACKEND: "tmux" }), /unknown backend "tmux"/);
});

test("agentFlags and shellQuote", () => {
  assert.deepEqual(agentFlags({ repoPath: "", name: "", agent: "claude", prompt: "", activate: false }), []);
  assert.deepEqual(agentFlags({ repoPath: "", name: "", agent: "claude", effort: "low", prompt: "", activate: false }), ["--effort", "low"]);
  assert.equal(shellQuote("a b"), "'a b'");
  assert.equal(shellQuote("it's"), "'it'\\''s'");
});
