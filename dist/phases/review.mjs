// Review phase — artifact-producing, and distinct from `verify` for that reason.
// A review reads the whole change and leaves prose behind (the PR body summary);
// a verify answers pass/fail. Parameterizing one into the other would blur two
// different contracts.
import { runPhaseSession } from "./context.mjs";
/** The phase's default prompt; a preset with its own passes `input.template`. */
export const REVIEW_TEMPLATE = "implement/review-prompt.md";
export async function runReviewPhase(ctx, input) {
    const run = await runPhaseSession(ctx, input, { template: REVIEW_TEMPLATE, maxIterations: 1 });
    let summary = "";
    if (input.summaryFile) {
        // `|| true` keeps a missing file from surfacing as a failed exec.
        const read = await ctx.sandbox.exec(`cat ${input.summaryFile} 2>/dev/null || true`);
        if (read.exitCode === 0)
            summary = read.stdout;
    }
    return { commits: run.commits.length, summary };
}
//# sourceMappingURL=review.mjs.map