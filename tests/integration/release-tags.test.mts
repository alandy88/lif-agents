// Release-tag discovery against the topology this repo's releases actually
// create — the one a mock cannot encode, because the bug it guards against was
// an assumption about git's ref rules rather than about our own code.
//
// The shape: a release commit is a CHILD of the main commit it was cut from,
// carrying dist/ and the stamped version, and only its tag ref is pushed. From
// a later main commit that tag is a sibling, not an ancestor. `git describe`
// walks ancestry, so it cannot see it — the first test asserts that directly,
// so the reason `lastReleaseTag` enumerates instead stays visible if someone
// later "simplifies" it back to describe.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { headIsStale, lastReleaseTag } from "../../scripts/release-gate.mts";
import { gitIn, makeTempRoot, must, removeTempRoot } from "./helpers.mts";

let root: string;
let repo: string;

before(async () => {
  root = makeTempRoot();
  repo = join(root, "repo");
  await must(gitIn(root), ["init", "-b", "main", repo]);
  const git = gitIn(repo);

  await must(git, ["commit", "--allow-empty", "-m", "A: ordinary work"]);

  // Two releases, each cut the way release.yml cuts one: commit on top of the
  // current main, tag it, then leave main where it was so the release commit is
  // reachable only through its tag.
  for (const version of ["v0.1.0", "v0.2.0"]) {
    const mainTip = (await must(git, ["rev-parse", "HEAD"])).stdout.trim();
    await must(git, ["commit", "--allow-empty", "-m", `release ${version}: build dist/`]);
    await must(git, ["tag", version]);
    await must(git, ["reset", "--hard", mainTip]);
    await must(git, ["commit", "--allow-empty", "-m", `work after ${version}`]);
  }
});

after(() => removeTempRoot(root));

test("git describe cannot see a release tag from main — the reason for the sort", async () => {
  const described = await gitIn(repo)(["describe", "--tags", "--match", "v[0-9]*", "--abbrev=0"]);
  assert.notEqual(described.exitCode, 0, "describe unexpectedly found a tag; topology changed");
});

test("lastReleaseTag finds the newest release tag despite it being unreachable", async () => {
  assert.equal(await lastReleaseTag(gitIn(repo)), "v0.2.0");
});

test("the sort is numeric, not lexical", async () => {
  await must(gitIn(repo), ["tag", "v0.10.0"]);
  // Lexically v0.2.0 sorts above v0.10.0, which would derive v0.3.0 next and
  // silently go backwards from the real latest release.
  assert.equal(await lastReleaseTag(gitIn(repo)), "v0.10.0");
});

test("non-release tags are skipped, even when they sort above every release", async () => {
  // `v[0-9]*` is only a prefilter. A moving `v1` major alias is the realistic
  // one here — consumers reference .github/workflows/agent.yml by tag — and
  // version sort puts it FIRST, ahead of every real release. Deriving from it
  // would throw in bump() and block automatic releases from then on.
  const git = gitIn(repo);
  for (const stray of ["v1", "v0.99.0-rc.1", "v0.99-backup"]) {
    await must(git, ["tag", stray]);
  }
  const listed = await must(git, ["tag", "--list", "v[0-9]*", "--sort=-v:refname"]);
  assert.ok(listed.stdout.startsWith("v1\n"), "setup: the stray tag should sort first");
  assert.equal(await lastReleaseTag(git), "v0.10.0");
});

test("no tags at all reads as absent, not as a v0.0.0 that could be logged", async () => {
  // null rather than "v0.0.0": the caller uses this as a git revision as well
  // as a version, and `git log v0.0.0..HEAD` against a tag that does not exist
  // is a fatal ambiguous-revision error that would fail every first release.
  const fresh = join(root, "first-release");
  await must(gitIn(root), ["init", "-b", "main", fresh]);
  assert.equal(await lastReleaseTag(gitIn(fresh)), null);
});

test("a run standing on an older commit than origin/main reads as stale", async () => {
  // The reachable case is a rerun: a run whose publish failed is exactly what an
  // operator retries, and it checks out its original event SHA. If anything
  // released in between, comparing that older payload against the newer tag
  // reads the rollback as a change and cuts a HIGHER version carrying
  // superseded code. The concurrency lock does not help — GitHub handles queued
  // runs in arbitrary order, so it serializes without ordering.
  const bare = join(root, "stale-origin.git");
  const clone = join(root, "stale-work");
  await must(gitIn(root), ["init", "--bare", "-b", "main", bare]);
  await must(gitIn(root), ["clone", bare, clone]);
  const git = gitIn(clone);

  await must(git, ["commit", "--allow-empty", "-m", "W"]);
  await must(git, ["push", "origin", "main"]);
  const older = (await must(git, ["rev-parse", "HEAD"])).stdout.trim();
  await must(git, ["commit", "--allow-empty", "-m", "X"]);
  await must(git, ["push", "origin", "main"]);

  assert.equal(await headIsStale(git), false, "at the tip, nothing to skip");
  await must(git, ["checkout", "--detach", older]);
  await must(git, ["fetch", "origin", "main"]);
  assert.equal(await headIsStale(git), true);
});
