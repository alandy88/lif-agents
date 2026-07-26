// Deliver phase — the branch becomes a pull request. This is one of the two
// adapter seams the consumers genuinely diverge on: PR-per-issue (open it and
// leave it for a human) vs. squash-merge-and-continue (the ledger loop merges
// its own task and moves to the next one).
//
// No sandbox and no agent: delivery is host-side `git`/`gh`, which is why this
// phase takes plain inputs rather than a PhaseContext.

import { ghCapture, ghJson, hostGit, type CaptureResult } from "../lib/host-exec.mts";

export interface DeliverInput {
  branch: string;
  /** Base branch for the PR. Defaults to `main`. */
  base?: string;
  title: string;
  body: string;
  /**
   * Squash-merge the PR and delete the branch instead of leaving it open. The
   * ledger lifecycle's delivery; the issue-driven one leaves the PR for a human.
   */
  squashMerge?: boolean;
}

export interface DeliverResult {
  prUrl: string;
  /** False when a PR for the branch already existed (a resumed run). */
  created: boolean;
}

/** The host commands this phase runs. Injectable so the tests can drive them. */
export interface DeliverDeps {
  gh: (args: string[]) => Promise<CaptureResult>;
  ghJson: (args: string[]) => Promise<string>;
  git: (args: string[]) => Promise<CaptureResult>;
}

const hostDeps: DeliverDeps = { gh: ghCapture, ghJson, git: hostGit };

export async function runDeliverPhase(
  input: DeliverInput,
  deps: DeliverDeps = hostDeps,
): Promise<DeliverResult> {
  const { branch } = input;
  const created = await deps.gh([
    "pr",
    "create",
    "--head",
    branch,
    "--base",
    input.base ?? "main",
    "--title",
    input.title,
    "--body",
    input.body,
  ]);

  let result: DeliverResult;
  if (created.exitCode === 0) {
    result = { prUrl: created.stdout.trim(), created: true };
  } else {
    // `gh pr create` exits non-zero when a PR for the branch already exists (a
    // re-run on the same issue or a resumed branch); look it up, and refresh the
    // body so the PR describes the work as it now stands rather than as it stood
    // when the first run stopped.
    const prUrl = (await deps.ghJson(["pr", "view", branch, "--json", "url", "--jq", ".url"])).trim();
    const edited = await deps.gh(["pr", "edit", branch, "--body", input.body]);
    if (edited.exitCode !== 0) {
      console.error(`Could not refresh the PR body on ${branch}; it still describes the prior run.`);
    }
    result = { prUrl, created: false };
  }

  if (input.squashMerge) {
    // No `--delete-branch`: `gh` deletes the local branch first and exits
    // non-zero when that fails — long AFTER the server-side merge has landed.
    // Reading that exit code as the merge's verdict aborts a loop over a
    // delivery that succeeded, so ask the PR what actually happened instead.
    const merge = await deps.gh(["pr", "merge", result.prUrl, "--squash"]);
    const state = (
      await deps.gh(["pr", "view", result.prUrl, "--json", "state", "--jq", ".state"])
    ).stdout.trim();
    if (state !== "MERGED") {
      throw new Error(
        `gh pr merge ${result.prUrl} exited ${merge.exitCode} and the PR is ` +
          `${state || "unreadable"}; merge it manually.`,
      );
    }

    // Cleanup is best-effort from here: the merge has landed, so nothing below
    // may abort the caller's loop. The local branch can still be held by a
    // worktree the caller did not release, which is a warning, not a failure.
    const local = await deps.git(["branch", "-D", branch]);
    if (local.exitCode !== 0) {
      console.error(`Merged ${result.prUrl}, but the local branch ${branch} was left behind.`);
    }
    const remote = await deps.git(["push", "origin", "--delete", branch]);
    if (remote.exitCode !== 0) {
      console.error(`Merged ${result.prUrl}, but the remote branch ${branch} was left behind.`);
    }
  }

  return result;
}
