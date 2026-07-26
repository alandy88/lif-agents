import { test } from "node:test";
import assert from "node:assert/strict";
import { assemblePreflight } from "./run.mts";
import { resolvePhases } from "./profiles.mts";
import { toolchains } from "./toolchains.mts";
import { providerPreflight } from "./provider-setup.mts";

// The order is the contract: a run must fail on a missing toolchain before it
// fails on a missing credential, or the warm-up error arrives disguised as an
// auth error and sends you looking in the wrong place.
test("preflight runs toolchain warm-up, then repo extras, then provider auth", () => {
  const run = resolvePhases({});
  const commands = assemblePreflight(
    { toolchain: "node", preflight: () => ["npm run docs"] },
    run,
  );

  assert.deepEqual(commands, [
    ...toolchains.node.preflight,
    "npm run docs",
    ...providerPreflight(Object.values(run.phases)),
  ]);
  assert.equal(commands[0], "npm ci");
});

test("a single-provider run gets only that provider's auth commands", () => {
  const commands = assemblePreflight({ toolchain: "python" }, resolvePhases({ labels: ["agent:claude"] }));

  assert.deepEqual(commands, [...toolchains.python.preflight, ...providerPreflight([{ provider: "claude", model: "x" }])]);
  assert.ok(!commands.some((command) => command.includes("codex")));
});
