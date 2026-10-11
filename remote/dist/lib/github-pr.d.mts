import { type CaptureResult } from "./host-exec.mts";
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
/** The host commands this adapter runs. Injectable so the tests can drive them. */
export interface DeliverDeps {
    gh: (args: string[]) => Promise<CaptureResult>;
    ghJson: (args: string[]) => Promise<string>;
    git: (args: string[]) => Promise<CaptureResult>;
}
export declare function deliverPullRequest(input: DeliverInput, deps?: DeliverDeps): Promise<DeliverResult>;
//# sourceMappingURL=github-pr.d.mts.map