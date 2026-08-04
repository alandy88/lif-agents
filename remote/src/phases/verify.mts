// Verify phase — a binary gate. A fresh context re-derives the change from the
// repo, fixes what is mechanically wrong, and emits one of two promises. Anything
// other than COMPLETE is a failure: a session that emitted nothing at all did not
// verify, so `passed` is false rather than "assume the best".

import { runPhaseSession, type PhaseContext, type PhaseInput } from "./context.mts";

/** The phase's default prompt; a preset with its own passes `input.template`. */
export const VERIFY_TEMPLATE = "task/verify-prompt.md";

export const VERIFY_COMPLETE = "<promise>COMPLETE</promise>";
export const VERIFY_FAILED = "<promise>VERIFY-FAILED</promise>";

export interface VerifyResult {
  passed: boolean;
  /** The promise the session emitted, if any — for the failure message. */
  signal?: string;
  /** Fix commits the verifier made on the branch. */
  commits: number;
}

export async function runVerifyPhase(
  ctx: PhaseContext,
  input: PhaseInput,
): Promise<VerifyResult> {
  const run = await runPhaseSession(ctx, input, { template: VERIFY_TEMPLATE, maxIterations: 3 }, [
    VERIFY_COMPLETE,
    VERIFY_FAILED,
  ]);
  return {
    passed: run.completionSignal === VERIFY_COMPLETE,
    signal: run.completionSignal,
    commits: run.commits.length,
  };
}
