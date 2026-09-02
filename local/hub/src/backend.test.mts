import assert from "node:assert/strict";
import { test } from "node:test";

import { backendName, worktreeName } from "./backend.mts";

test("worktreeName appends the clock time", () => {
  assert.equal(worktreeName("fix-bug", new Date(2026, 8, 2, 9, 5)), "fix-bug-0905");
});

test("backendName: flag beats env beats HERDR_ENV, and orca is the fallback", () => {
  assert.equal(backendName({ LIF_HUB_BACKEND: "orca", HERDR_ENV: "1" }, "herdr"), "herdr");
  assert.equal(backendName({ LIF_HUB_BACKEND: "orca", HERDR_ENV: "1" }), "orca");
  assert.equal(backendName({ HERDR_ENV: "1" }), "herdr");
  assert.equal(backendName({}), "orca");
  assert.throws(() => backendName({ LIF_HUB_BACKEND: "tmux" }), /unknown backend "tmux"/);
});
