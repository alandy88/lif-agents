import { type PhaseContext, type PhaseInput } from "./context.mts";
/** The phase's default prompt; a preset with its own passes `input.template`. */
export declare const PLAN_TEMPLATE = "implement/plan-prompt.md";
export interface PlanResult {
    commits: number;
}
export declare function runPlanPhase(ctx: PhaseContext, input: PhaseInput): Promise<PlanResult>;
//# sourceMappingURL=plan.d.mts.map