import { type PhaseContext, type PhaseInput } from "./context.mts";
/** The phase's default prompt; a preset with its own passes `input.template`. */
export declare const REVIEW_TEMPLATE = "implement/review-prompt.md";
export interface ReviewInput extends PhaseInput {
    /**
     * Branch-local file the review session writes its summary to. Read back after
     * the session; absent and unreadable both come back empty.
     */
    summaryFile?: string;
}
export interface ReviewResult {
    commits: number;
    /** The harvested summary, or `""` when none was requested or left. */
    summary: string;
}
export declare function runReviewPhase(ctx: PhaseContext, input: ReviewInput): Promise<ReviewResult>;
//# sourceMappingURL=review.d.mts.map