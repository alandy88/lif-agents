import assert from "node:assert/strict";
import { test } from "node:test";

import { parseArgs } from "./cli.mts";

test("parseArgs: bare words become the message", () => {
  const a = parseArgs(["fix", "the", "thing"]);
  assert.equal(a.command, "route");
  assert.equal(a.message, "fix the thing");
});

test("parseArgs: --b64 decodes utf8 and overrides win", () => {
  const a = parseArgs(["--mode", "exec", "--repo", "r", "--b64", Buffer.from("héllo").toString("base64"), "--dry-run"]);
  assert.equal(a.message, "héllo");
  assert.equal(a.mode, "exec");
  assert.equal(a.repo, "r");
  assert.equal(a.dryRun, true);
});

test("parseArgs: serve/open subcommands and --port", () => {
  assert.equal(parseArgs(["serve"]).command, "serve");
  assert.equal(parseArgs(["open", "--port", "5000"]).port, 5000);
  assert.throws(() => parseArgs(["serve", "--port", "zero"]), /--port/);
});
