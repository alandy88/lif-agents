// The rules a reader cannot see by reading the regexes: the `fix` floor, the
// 0.x demotion of breaking changes, and what "explicit wins" is still checked
// for. Deliberately untested: that `feat:` matches /^feat/ and that a patch
// bump adds one to the last digit — restating the implementation's own
// expression proves nothing, and commit e6ac8fe removed that class of test.

import assert from "node:assert/strict";
import test from "node:test";

import { bump, classify, nextVersion, resolveExplicit } from "./next-version.mts";

test("an unclassified subject still releases — the floor is patch, not silence", () => {
  // The `bb2f75a` case: "chore: bump routing model ids" changed the model every
  // consumer resolves, and sat untagged across two releases because the subject
  // claimed nothing. Silence from the author is not evidence of no change.
  assert.equal(classify(["chore: bump routing model ids to the current generation"]), "fix");
  assert.equal(classify(["tidy up the loop"]), "fix");
});

test("the largest impact across the range wins, not the last one", () => {
  assert.equal(classify(["feat: add a phase", "fix: correct a path"]), "feature");
  assert.equal(classify(["fix: correct a path", "feat!: drop the deliver subpath"]), "breaking");
});

test("a BREAKING CHANGE body counts even when the subject does not say so", () => {
  const message = "refactor: move the deliver phase\n\nBREAKING CHANGE: phases/deliver is gone.";
  assert.equal(classify([message]), "breaking");
});

test("below 1.0.0 a breaking change is a minor bump, not a major one", () => {
  assert.equal(bump("0.2.3", "breaking"), "0.3.0");
  assert.equal(bump("0.2.3", "feature"), "0.3.0");
  assert.equal(bump("0.2.3", "fix"), "0.2.4");
});

test("at or above 1.0.0 the ordinary semver rules apply", () => {
  assert.equal(bump("1.4.2", "breaking"), "2.0.0");
  assert.equal(bump("1.4.2", "feature"), "1.5.0");
  assert.equal(bump("1.4.2", "fix"), "1.4.3");
});

test("nextVersion reads the tag's v prefix and returns a bare version", () => {
  assert.equal(nextVersion("v0.2.3", ["feat: something"]), "0.3.0");
});

test("a first release derives from 0.0.0 without needing a tag to exist", () => {
  assert.equal(nextVersion("v0.0.0", ["feat: the first thing"]), "0.1.0");
  assert.equal(nextVersion("v0.0.0", ["initial import"]), "0.0.1");
});

test("bump rejects a version it cannot parse rather than emitting NaN", () => {
  assert.throws(() => bump("0.0.0-development", "fix"), /not a semver/);
});

test("an explicit tag must be well-formed and must move forward", () => {
  assert.equal(resolveExplicit("v0.3.0", "v0.2.3"), "0.3.0");
  assert.throws(() => resolveExplicit("0.3.0", "v0.2.3"), /must look like/);
  assert.throws(() => resolveExplicit("v0.2.3", "v0.2.3"), /does not move forward/);
  assert.throws(() => resolveExplicit("v0.2.2", "v0.2.3"), /does not move forward/);
});
