import { type PhaseContext, type PhaseInput } from "./context.mts";
/** The phase's default prompt; a preset with its own passes `input.template`. */
export declare const VERIFY_TEMPLATE = "task/verify-prompt.md";
export declare const VERIFY_COMPLETE = "<promise>COMPLETE</promise>";
export declare const VERIFY_FAILED = "<promise>VERIFY-FAILED</promise>";
export interface VerifyResult {
    passed: boolean;
    /** The promise the session emitted, if any — for the failure message. */
    signal?: string;
    /** Fix commits the verifier made on the branch. */
    commits: number;
}
export declare function runVerifyPhase(ctx: PhaseContext, input: PhaseInput): Promise<VerifyResult>;
//# sourceMappingURL=verify.d.mts.map