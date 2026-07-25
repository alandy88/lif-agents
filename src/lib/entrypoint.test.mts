import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { isEntrypoint } from "./entrypoint.mts";

test("isEntrypoint is true only for the module argv[1] points at", () => {
  const argv1 = process.argv[1];
  assert.ok(argv1, "the test runner always has an argv[1]");
  // node --test points argv[1] at each test file, so this module IS the entry.
  assert.equal(isEntrypoint(pathToFileURL(resolve(argv1)).href), true);
  assert.equal(isEntrypoint(import.meta.url), true);
  // A module the entry merely imports — the case a consumer's config.mts must
  // not trip when a test pulls it in for its exports.
  assert.equal(isEntrypoint(new URL("./entrypoint.mts", import.meta.url).href), false);
});
