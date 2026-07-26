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
//
// `lastReleaseTag`'s runner is synchronous and the helpers here are not, so
// each test resolves the git call and hands the real stdout to the function
// under test. The command being run is still real git against a real repo.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { lastReleaseTag } from "../../scripts/next-version.mts";
import { gitIn, makeTempRoot, must, removeTempRoot } from "./helpers.mts";

const LIST_TAGS = ["tag", "--list", "v[0-9]*", "--sort=-v:refname"];

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
  const listed = await must(gitIn(repo), LIST_TAGS);
  assert.equal(lastReleaseTag(() => listed.stdout), "v0.2.0");
});

test("the sort is numeric, not lexical", async () => {
  await must(gitIn(repo), ["tag", "v0.10.0"]);
  const listed = await must(gitIn(repo), LIST_TAGS);
  // Lexically v0.2.0 sorts above v0.10.0, which would derive v0.3.0 next and
  // silently go backwards from the real latest release.
  assert.equal(lastReleaseTag(() => listed.stdout), "v0.10.0");
});

test("no tags at all reads as v0.0.0, so a first release starts from zero", () => {
  assert.equal(lastReleaseTag(() => ""), "v0.0.0");
});
