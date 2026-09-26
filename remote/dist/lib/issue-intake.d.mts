import type { Issue } from "./github-issue.mts";
import { type ResolvedPhases } from "./profiles.mts";
/**
 * Deliberately the narrow read pair, not `IssueBodySource`: intake never
 * writes (no `comment`, no `setBody`), so its dependency surface says so.
 */
export type IntakeReads = {
    getIssue: (issueNumber: number) => Promise<Issue>;
    issueIsEpic: (issueNumber: number) => Promise<boolean>;
};
export type IntakeRequest = {
    issueNumber: number;
    /** "issues" means label-triggered; anything else is workflow_dispatch. */
    trigger?: string;
    dispatchProfile?: string;
    modelOverride?: string;
    defaultProfile?: string;
};
/**
 * `cause` is load-bearing and asymmetric by design: only the configuration
 * path sets it, carrying the raw `resolvePhases` error underneath a wrapped
 * `detail` string (the issue comment gets the wrapped text; `main`'s
 * `throw admission.cause ?? new Error(admission.detail)` gets the original).
 * Closed and epic rejections set no `cause`, so `main` throws a fresh
 * `Error(detail)` for those instead.
 *
 * `because` names which guard rejected, so `main` can log a diagnostic
 * specific to the failed guard without re-deriving it from `detail`.
 */
export type Admission = {
    kind: "admitted";
    issue: Issue;
    run: ResolvedPhases;
} | {
    kind: "skipped";
    reason: string;
} | {
    kind: "rejected";
    because: RejectionKind;
    detail: string;
    cause?: unknown;
};
export type RejectionKind = "closed" | "epic" | "configuration";
/**
 * The four admission guards, in the order `main` used to run them — a closed
 * issue is rejected before a missing label is skipped, and both precede the
 * epic check and profile resolution.
 */
export declare function admit(request: IntakeRequest, reads: IntakeReads): Promise<Admission>;
//# sourceMappingURL=issue-intake.d.mts.map