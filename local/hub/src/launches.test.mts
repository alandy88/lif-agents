import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { MAX_RECORDS, launchLogPath, openLaunchLog } from "./launches.mts";

const rec = (message: string) => ({
  backend: "orca" as const, message, mode: "exec", domain: null, repo: "r", name: "n", worktreeId: "w", worktreePath: "/w",
});

test("launchLogPath follows XDG_STATE_HOME, else ~/.local/state", () => {
  assert.equal(launchLogPath({ XDG_STATE_HOME: "/s" }), "/s/lif-hub/launches.json");
  assert.equal(launchLogPath({ HOME: "/h" }), "/h/.local/state/lif-hub/launches.json");
});

test("openLaunchLog persists newest-first across reopen, finds by id, and caps the file", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hub-log-")), "deep", "launches.json");
  const log = openLaunchLog(file);
  assert.deepEqual(log.list(), []);
  const one = log.add(rec("one"));
  log.add(rec("two"));
  const again = openLaunchLog(file);
  assert.deepEqual(again.list().map((r) => r.message), ["two", "one"]);
  assert.equal(again.get(one.id)?.message, "one");
  for (let i = 0; i < MAX_RECORDS; i++) again.add(rec(`x${i}`));
  assert.equal(again.list().length, MAX_RECORDS);
});
