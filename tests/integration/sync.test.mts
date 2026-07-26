// The task loop's preflight is `syncMain()`, whose whole contract is that a
// clean fast-forward reads true and a diverged main reads false — "stop before
// spending tokens". Run the real function against real clones: the kit code and
// the git behaviour it depends on are pinned together, which a hand-rolled
// `git pull` here would not do.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { syncMain } from "../../src/lib/branch.mts";
import { gitIn, makeTempRoot, must, removeTempRoot } from "./helpers.mts";

let root: string;

before(async () => {
  root = makeTempRoot();
  const origin = join(root, "origin.git");
  await must(gitIn(root), ["init", "--bare", "-b", "main", origin]);

  // Seed origin/main, then advance it from a writer clone so the clones below
  // start out behind.
  const writer = join(root, "writer");
  await must(gitIn(root), ["clone", origin, writer]);
  await must(gitIn(writer), ["commit", "--allow-empty", "-m", "init"]);
  await must(gitIn(writer), ["push", "origin", "main"]);

  for (const name of ["behind", "diverged"]) {
    await must(gitIn(root), ["clone", origin, join(root, name)]);
  }
  await must(gitIn(writer), ["commit", "--allow-empty", "-m", "upstream work"]);
  await must(gitIn(writer), ["push", "origin", "main"]);
});

after(() => removeTempRoot(root));

test("a clean clone behind origin fast-forwards: syncMain true", async () => {
  assert.equal(await syncMain(gitIn(join(root, "behind"))), true);
});

test("a diverged main refuses to fast-forward: syncMain false", async () => {
  const git = gitIn(join(root, "diverged"));
  await must(git, ["commit", "--allow-empty", "-m", "local divergence"]);
  assert.equal(await syncMain(git), false);
});
