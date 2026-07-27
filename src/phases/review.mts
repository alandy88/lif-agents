// Review phase — artifact-producing, and distinct from `verify` for that reason.
// A review reads the whole change and leaves prose behind (the PR body summary);
// a verify answers pass/fail. Parameterizing one into the other would blur two
// different contracts.

import {
  readSandboxFile,
  runPhaseSession,
  type PhaseContext,
  type PhaseInput,
} from "./context.mts";

/** The phase's default prompt; a preset with its own passes `input.template`. */
export const REVIEW_TEMPLATE = "implement/review-prompt.md";

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

export async function runReviewPhase(
  ctx: PhaseContext,
  input: ReviewInput,
): Promise<ReviewResult> {
  const run = await runPhaseSession(ctx, input, { template: REVIEW_TEMPLATE, maxIterations: 1 });

  const summary = input.summaryFile ? await readSandboxFile(ctx.sandbox, input.summaryFile) : "";
  return { commits: run.commits.length, summary };
}
