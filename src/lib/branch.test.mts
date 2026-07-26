// One test per decision this module makes that a reader cannot see from the
// command it runs — and deliberately none for the commands themselves. Most of
// this module is a command string plus a `git` invocation, and a unit test that
// asserts the argv it just read out of the source restates a constant; commit
// e6ac8fe removed exactly that kind of test, and the integration tier
// (tests/integration/) covers what real git does with these commands anyway.
//
// The decisions, all of them about what a failure means:
//   • `push` converts a non-zero exit into a throw (the run stops),
//   • `pushCheckpoint` deliberately does NOT (the run continues) — the exact
//     point the two presets had drifted on, and invisible in the argv,
//   • `commitOnBranch` turns a rejected commit into a throw rather than
//     resolving void over it,
//   • `dropArtifacts` returns false for a clean no-op and ONLY that, so both
//     the probe failing and the removal failing have to throw instead.

import assert from "node:assert/strict";
import test from "node:test";

import { commitOnBranch, dropArtifacts, push, pushCheckpoint, type ExecSandbox } from "./branch.mts";

const exits = (exitCode: number) => async () => ({ stdout: "", stderr: "", exitCode });

/** Records the command strings it is handed; `stdout` replies come from a queue. */
function fakeSandbox(stdouts: string[]): ExecSandbox & { commands: string[] } {
  const commands: string[] = [];
  return {
    commands,
    async exec(command: string) {
      commands.push(command);
      return { stdout: stdouts.shift() ?? "", exitCode: 0 };
    },
  };
}

test("push: a non-zero exit throws, carrying the exit code", async () => {
  await assert.rejects(
    () => push("agent/issue-7", exits(128)),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /agent\/issue-7/);
      assert.match(error.message, /exited 128/);
      return true;
    },
  );
});

test("pushCheckpoint: a non-zero exit is reported and resolves false, never throws", async () => {
  const reported: string[] = [];
  const realError = console.error;
  console.error = (message: string) => reported.push(message);
  try {
    const pushed = await pushCheckpoint("agent/issue-7", exits(128));
    assert.equal(pushed, false);
  } finally {
    console.error = realError;
  }
  assert.equal(reported.length, 1);
  assert.match(reported[0]!, /exited 128; continuing\./);
});

test("commitOnBranch: a rejected commit throws rather than resolving void", async () => {
  // The signature returns void, so a swallowed failure is invisible to every
  // caller. For the trailer commit that would drop the durable Task-Done record
  // while the loop carried on marking the task done.
  const rejecting: ExecSandbox = { async exec() { return { stdout: "", exitCode: 1 }; } };
  await assert.rejects(
    () => commitOnBranch(rejecting, "chore(tasks): complete task 3", { trailer: "Task-Done: 3" }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /exited 1/);
      return true;
    },
  );
});

test("dropArtifacts: nothing tracked → the ls-files probe is the only exec", async () => {
  const sandbox = fakeSandbox([""]); // ls-files finds nothing
  const committed = await dropArtifacts(sandbox, ["AGENT_NOTES.md", "AGENT_SUMMARY.md"]);
  assert.equal(committed, false);
  assert.equal(sandbox.commands.length, 1);
  assert.match(sandbox.commands[0]!, /^git ls-files/);
});

test("dropArtifacts: a failed probe throws instead of reading as nothing tracked", async () => {
  // An unreadable index exits non-zero with empty stdout — byte-identical to a
  // clean repo unless the exit code is checked. Returning false there would
  // hand the caller the one answer `false` is not allowed to mean.
  const probeFails: ExecSandbox = { async exec() { return { stdout: "", exitCode: 128 }; } };
  await assert.rejects(
    () => dropArtifacts(probeFails, ["AGENT_NOTES.md"]),
    /probing for run artifacts .* exited 128/,
  );
});
