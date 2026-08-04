import { test } from "node:test";
import assert from "node:assert/strict";
import { deliverPullRequest, type DeliverDeps } from "./github-pr.mts";

// Drives DeliverDeps with canned gh/git responses; no real network or git.

/** Deliver's host commands, recorded; `gh`/`git` exit 0 unless told otherwise. */
function fakeDeliverDeps(
  options: { state?: string; mergeExit?: number; gitExit?: number } = {},
) {
  const gh: string[][] = [];
  const git: string[][] = [];
  const deps: DeliverDeps = {
    gh: async (args) => {
      gh.push(args);
      if (args[1] === "merge") {
        return { stdout: "", stderr: "", exitCode: options.mergeExit ?? 0 };
      }
      if (args[1] === "view") {
        return { stdout: `${options.state ?? "MERGED"}\n`, stderr: "", exitCode: 0 };
      }
      return { stdout: "https://example.test/pr/1\n", stderr: "", exitCode: 0 };
    },
    ghJson: async () => "https://example.test/pr/1\n",
    git: async (args) => {
      git.push(args);
      return { stdout: "", stderr: "", exitCode: options.gitExit ?? 0 };
    },
  };
  return { deps, gh, git };
}

const DELIVERY = { branch: "agent/2-6-turns", title: "Task 2.6", body: "body" };

test("delivery without squash-merge leaves the PR open and touches no branch", async () => {
  const { deps, gh, git } = fakeDeliverDeps();
  const result = await deliverPullRequest(DELIVERY, deps);

  assert.deepEqual(result, { prUrl: "https://example.test/pr/1", created: true });
  assert.deepEqual(gh.map((args) => args[1]), ["create"]);
  assert.deepEqual(git, []);
});

test("the squash-merge path never passes --delete-branch and cleans up explicitly", async () => {
  const { deps, gh, git } = fakeDeliverDeps();
  await deliverPullRequest({ ...DELIVERY, squashMerge: true }, deps);

  const merge = gh.find((args) => args[1] === "merge")!;
  assert.ok(!merge.includes("--delete-branch"));
  assert.deepEqual(git, [
    ["branch", "-D", DELIVERY.branch],
    ["push", "origin", "--delete", DELIVERY.branch],
  ]);
});

test("a merged PR survives a non-zero merge exit and a failed cleanup", async () => {
  // The bug this adapter exists to not repeat: a worktree holding the branch made
  // `gh` exit 1 after the merge had landed, and the loop aborted on a success.
  const { deps, git } = fakeDeliverDeps({ mergeExit: 1, gitExit: 1, state: "MERGED" });
  const result = await deliverPullRequest({ ...DELIVERY, squashMerge: true }, deps);

  assert.equal(result.prUrl, "https://example.test/pr/1");
  assert.equal(git.length, 2, "cleanup keeps going after the local delete fails");
});

test("delivery throws when the PR did not actually merge", async () => {
  const { deps, git } = fakeDeliverDeps({ mergeExit: 1, state: "OPEN" });
  await assert.rejects(
    deliverPullRequest({ ...DELIVERY, squashMerge: true }, deps),
    /the PR is OPEN; merge it manually/,
  );
  assert.deepEqual(git, [], "nothing is deleted when the merge did not land");
});
