// Review phase — artifact-producing, and distinct from `verify` for that reason.
// A review reads the whole change and leaves prose behind (the PR body summary);
// a verify answers pass/fail. Parameterizing one into the other would blur two
// different contracts.
import { readSandboxFile, runPhaseSession, } from "./context.mjs";
/** The phase's default prompt; a preset with its own passes `input.template`. */
export const REVIEW_TEMPLATE = "implement/review-prompt.md";
export async function runReviewPhase(ctx, input) {
    const run = await runPhaseSession(ctx, input, { template: REVIEW_TEMPLATE, maxIterations: 1 });
    const summary = input.summaryFile ? await readSandboxFile(ctx.sandbox, input.summaryFile) : "";
    return { commits: run.commits.length, summary };
}
//# sourceMappingURL=review.mjs.map