// The task loop's preflight is `git pull --ff-only origin main` and it treats
// a non-zero exit as "main diverged, stop before spending tokens". That
// reading is an assumption about git, not about kit code — pin it here.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
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

test("a clean clone behind origin fast-forwards: exit 0", async () => {
  const pull = await gitIn(join(root, "behind"))(["pull", "--ff-only", "origin", "main"]);
  assert.equal(pull.exitCode, 0);
});

test("a diverged main refuses to fast-forward: non-zero exit", async () => {
  const git = gitIn(join(root, "diverged"));
  await must(git, ["commit", "--allow-empty", "-m", "local divergence"]);
  const pull = await git(["pull", "--ff-only", "origin", "main"]);
  assert.notEqual(pull.exitCode, 0);
});
