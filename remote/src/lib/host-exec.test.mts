import assert from "node:assert/strict";
import test from "node:test";

import { capture, json } from "./host-exec.mts";

// Portable across the Windows dev box and the Linux CI runner: `node -e` is the
// node that's already running these tests, so it is guaranteed present. `process.exit`
// lets each case dial the exit code deterministically.
const NODE = process.execPath;

test("capture: exit 0 → { stdout, exitCode: 0 }", async () => {
  const r = await capture(NODE, ["-e", "process.stdout.write('ok')"]);
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, "ok");
});

test("capture: non-zero exit is surfaced, not thrown", async () => {
  const r = await capture(NODE, ["-e", "process.exit(3)"]);
  assert.equal(r.exitCode, 3);
});

test("capture: child stderr is buffered as well as written through", async () => {
  // The workspaceVerify runner puts this in the green-check failure detail —
  // `lif-cli dev verify` reports its failures on stderr.
  const r = await capture(NODE, [
    "-e",
    "process.stderr.write('boom'); process.exit(1)",
  ]);
  assert.equal(r.exitCode, 1);
  assert.equal(r.stderr, "boom");
  assert.equal(r.stdout, "");
});

test("capture: spawn error → { stdout: '', exitCode: 1 }", async () => {
  const r = await capture("definitely-not-a-real-command-xyz", []);
  assert.equal(r.exitCode, 1);
  assert.equal(r.stdout, "");
});

test("capture: timeout kills the child → exitCode 124", async () => {
  // Sleep well past the cap; the SIGKILL fires first and resolves 124.
  const r = await capture(NODE, ["-e", "setTimeout(() => {}, 60000)"], { timeoutMs: 100 });
  assert.equal(r.exitCode, 124);
});

test("json: exit 0 → resolves stdout", async () => {
  const stdout = await json(NODE, ["-e", "process.stdout.write('payload')"]);
  assert.equal(stdout, "payload");
});

test("json: non-zero exit → rejects with command/args/code/stderr in the message", async () => {
  await assert.rejects(
    () => json(NODE, ["-e", "process.stderr.write('boom'); process.exit(2)"]),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /exited 2/);
      assert.match(err.message, /boom/);
      return true;
    },
  );
});
