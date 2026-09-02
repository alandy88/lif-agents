import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const shim = path.resolve("local/bin/lif-hub");

test("the compatibility shim rejects removed serve instead of launching it as a task", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "lif-hub-shim-"));
  const fake = path.join(directory, "lif-cli");
  writeFileSync(fake, "#!/bin/sh\nprintf '%s\\n' \"$@\"\n");
  chmodSync(fake, 0o755);
  const env = { ...process.env, PATH: `${directory}:${process.env.PATH ?? ""}` };

  const removed = spawnSync(shim, ["serve"], { encoding: "utf8", env });
  assert.equal(removed.status, 2);
  assert.match(removed.stderr, /serve was removed/);
  assert.equal(removed.stdout, "");

  const forwarded = spawnSync(shim, ["list"], { encoding: "utf8", env });
  assert.equal(forwarded.status, 0);
  assert.equal(forwarded.stdout, "hub\nlist\n");
});
