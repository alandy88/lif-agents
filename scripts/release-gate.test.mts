// Only the decisions a reader cannot see from the git commands being run, and
// only the ones that need no repo — what the gate does when git or the manifest
// fails it. Everything the gate decides WITH git (ignored dist/, the templates
// pathspec, the excluded version key) is in tests/integration/, against real
// repos, because a fake `git` here would just agree with whatever the source
// already says.

import assert from "node:assert/strict";
import test from "node:test";

import { headIsStale, lastReleaseTag, payloadChanged } from "./release-gate.mts";

const replies =
  (results: Record<string, { stdout?: string; exitCode?: number }>) => async (args: string[]) => {
    const reply = results[args[0]!] ?? {};
    return { stdout: reply.stdout ?? "", stderr: "", exitCode: reply.exitCode ?? 0 };
  };

test("a git that cannot enumerate tags throws rather than claiming a first release", async () => {
  // No tags is exit 0 with empty output, so a non-zero exit is git failing. Read
  // as "no tags" it would derive from v0.0.0 and try to re-cut an existing
  // version — wrong silently, and only failing later at `git tag`.
  await assert.rejects(
    () => lastReleaseTag(replies({ tag: { exitCode: 128 } })),
    /enumerating release tags exited 128/,
  );
});

test("a repo with no tags is still absent, not an error", async () => {
  assert.equal(await lastReleaseTag(replies({ tag: { stdout: "" } })), null);
});

test("a freshness fetch that fails throws instead of comparing stale data", async () => {
  // `hostGit` never rejects — it resolves a non-zero exitCode — so a dropped
  // fetch result would leave the comparison running against the origin/main
  // cached at checkout, letting a superseded HEAD read as current. That is the
  // exact failure headIsStale exists to prevent, so it must not guess.
  await assert.rejects(
    () => headIsStale(replies({ fetch: { exitCode: 128 }, "rev-parse": { stdout: "abc" } })),
    /fetching origin\/main to check freshness exited 128/,
  );
});

test("a working package.json that will not parse releases rather than throwing", async () => {
  // Same bias as everywhere else in this gate: for a git-installed package the
  // recoverable failure is a tag nobody needed, not a change that never ships.
  const git = replies({ add: {}, diff: {}, show: { stdout: '{"name":"kit"}' } });
  assert.equal(await payloadChanged("v0.1.0", git, () => "{ not json"), true);
});
