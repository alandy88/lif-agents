import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isEntrypoint } from "./entrypoint.mts";

test("isEntrypoint is true only for the module argv[1] points at", () => {
  // Set argv[1] rather than read it: test runners disagree on whether it names
  // the test file (node --test) or the runner binary (bun test).
  const restore = process.argv[1];
  const entry = fileURLToPath(new URL("./config.mts", import.meta.url));
  process.argv[1] = entry;
  try {
    assert.equal(isEntrypoint(pathToFileURL(entry).href), true);
    // A module the entry merely imports — the case a consumer's config.mts must
    // not trip when a test pulls it in for its exports.
    assert.equal(isEntrypoint(new URL("./entrypoint.mts", import.meta.url).href), false);
  } finally {
    process.argv[1] = restore;
  }
});

test("isEntrypoint is false when the process has no argv[1]", () => {
  const restore = process.argv[1];
  process.argv.splice(1, 1);
  try {
    assert.equal(isEntrypoint(import.meta.url), false);
  } finally {
    process.argv.splice(1, 0, restore as string);
  }
});
