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
export declare function runDeliverPhase(input: DeliverInput): Promise<DeliverResult>;
//# sourceMappingURL=deliver.d.mts.map