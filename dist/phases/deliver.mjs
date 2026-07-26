// Deliver phase — the branch becomes a pull request. This is one of the two
// adapter seams the consumers genuinely diverge on: PR-per-issue (open it and
// leave it for a human) vs. squash-merge-and-continue (the ledger loop merges
// its own task and moves to the next one).
//
// No sandbox and no agent: delivery is host-side `git`/`gh`, which is why this
// phase takes plain inputs rather than a PhaseContext.
import { ghCapture, ghJson, hostGit } from "../lib/host-exec.mjs";
export async function runDeliverPhase(input) {
    const { branch } = input;
    const created = await ghCapture([
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
    let result;
    if (created.exitCode === 0) {
        result = { prUrl: created.stdout.trim(), created: true };
    }
    else {
        // `gh pr create` exits non-zero when a PR for the branch already exists (a
        // re-run on the same issue or a resumed branch); look it up, and refresh the
        // body so the PR describes the work as it now stands rather than as it stood
        // when the first run stopped.
        const prUrl = (await ghJson(["pr", "view", branch, "--json", "url", "--jq", ".url"])).trim();
        const edited = await ghCapture(["pr", "edit", branch, "--body", input.body]);
        if (edited.exitCode !== 0) {
            console.error(`Could not refresh the PR body on ${branch}; it still describes the prior run.`);
        }
        result = { prUrl, created: false };
    }
    if (input.squashMerge) {
        const merge = await ghCapture(["pr", "merge", result.prUrl, "--squash", "--delete-branch"]);
        if (merge.exitCode !== 0) {
            throw new Error(`gh pr merge ${result.prUrl} exited ${merge.exitCode}; merge it manually.`);
        }
        await hostGit(["branch", "-D", branch]); // best-effort local cleanup
    }
    return result;
}
//# sourceMappingURL=deliver.mjs.map