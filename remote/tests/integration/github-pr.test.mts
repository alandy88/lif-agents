// The pull-request adapter's cleanup against real git. The unit tests drive
// DeliverDeps with canned exit codes; this manufactures the actual conditions
// — a worktree holding the branch (the `4933566` incident), a free branch, a
// real remote — and lets git produce the exit codes. Only `gh` is stubbed: it
// needs a GitHub, and its contract is already pinned in github-pr.test.mts.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { deliverPullRequest, type DeliverDeps } from "../../src/lib/github-pr.mts";
import type { CaptureResult } from "../../src/lib/host-exec.mts";
import { gitIn, makeTempRoot, must, removeTempRoot } from "./helpers.mts";

const PR_URL = "https://github.com/x/y/pull/1";
const ok = (stdout = ""): CaptureResult => ({ stdout, stderr: "", exitCode: 0 });

/** gh where the PR opens and the squash-merge lands. */
const mergedGh: Pick<DeliverDeps, "gh" | "ghJson"> = {
  gh: async (args) => {
    if (args[1] === "create") return ok(PR_URL);
    if (args[1] === "view") return ok("MERGED");
    return ok();
  },
  ghJson: async () => PR_URL,
};

let root: string;
let clone: string;
let git: ReturnType<typeof gitIn>;
let deps: DeliverDeps;

before(async () => {
  root = makeTempRoot();
  const origin = join(root, "origin.git");
  clone = join(root, "clone");
  await must(gitIn(root), ["init", "--bare", "-b", "main", origin]);
  await must(gitIn(root), ["clone", origin, clone]);
  git = gitIn(clone);
  await must(git, ["commit", "--allow-empty", "-m", "init"]);
  await must(git, ["push", "origin", "main"]);
  deps = { ...mergedGh, git };
});

after(() => removeTempRoot(root));

async function makeDeliveredBranch(branch: string): Promise<void> {
  await must(git, ["branch", branch]);
  await must(git, ["push", "origin", branch]);
}

test("a worktree holding the branch degrades cleanup, never the delivery", async () => {
  const branch = "agent/held";
  await makeDeliveredBranch(branch);
  // The incident shape: the sandbox's worktree still has the branch checked
  // out, so `git branch -D` genuinely fails on the host.
  await must(git, ["worktree", "add", join(root, "wt-held"), branch]);

  const result = await deliverPullRequest(
    { branch, title: "t", body: "b", squashMerge: true },
    deps,
  );

  assert.deepEqual(result, { prUrl: PR_URL, created: true });
  // Local deletion failed (worktree holds it) — branch survives...
  assert.equal((await git(["rev-parse", "--verify", branch])).exitCode, 0);
  // ...but the remote deletion still went through.
  assert.notEqual((await git(["rev-parse", "--verify", `origin/${branch}`])).exitCode, 0);
});

test("an unheld branch is fully cleaned up, local and remote", async () => {
  const branch = "agent/free";
  await makeDeliveredBranch(branch);

  const result = await deliverPullRequest(
    { branch, title: "t", body: "b", squashMerge: true },
    deps,
  );

  assert.deepEqual(result, { prUrl: PR_URL, created: true });
  assert.notEqual((await git(["rev-parse", "--verify", branch])).exitCode, 0);
  assert.notEqual((await git(["rev-parse", "--verify", `origin/${branch}`])).exitCode, 0);
});
