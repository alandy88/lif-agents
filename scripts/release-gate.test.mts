// Only the decisions a reader cannot see from the git commands being run, and
// only the ones that need no repo — what the gate does when git or the manifest
// fails it. Everything the gate decides WITH git (ignored dist/, the templates
// pathspec, the excluded version key) is in tests/integration/, against real
// repos, because a fake `git` here would just agree with whatever the source
// already says.

import assert from "node:assert/strict";
import test from "node:test";

import { lastReleaseTag, payloadChanged } from "./release-gate.mts";

const replies =
  (results: Record<string, { stdout?: string; exitCode?: number }>) => async (args: string[]) => {
    const reply = results[args[0]!] ?? {};
    return { stdout: reply.stdout ?? "", stderr: "", exitCode: reply.exitCode ?? 0 };
  };

test("a git that cannot enumerate tags reads as no tags, not as a crash", async () => {
  // The shell's `|| true`. An empty enumeration is the ordinary first-release
  // case, and a first release must not need an operator to unblock it.
  assert.equal(await lastReleaseTag(replies({ tag: { exitCode: 128 } })), null);
});

test("a working package.json that will not parse releases rather than throwing", async () => {
  // Same bias as everywhere else in this gate: for a git-installed package the
  // recoverable failure is a tag nobody needed, not a change that never ships.
  const git = replies({ add: {}, diff: {}, show: { stdout: '{"name":"kit"}' } });
  assert.equal(await payloadChanged("v0.1.0", git, () => "{ not json"), true);
});
