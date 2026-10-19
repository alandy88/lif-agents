// Plan phase — slice the work into a checklist. The planner edits the source of
// truth itself (today: the GitHub issue body, via `gh`); the host re-reads it,
// so the phase only reports whether the session ran and what it committed.
import { runPhaseSession } from "./context.mjs";
/** The phase's default prompt; a preset with its own passes `input.template`. */
export const PLAN_TEMPLATE = "implement/plan-prompt.md";
export async function runPlanPhase(ctx, input) {
    const run = await runPhaseSession(ctx, input, { template: PLAN_TEMPLATE, maxIterations: 2 });
    return { commits: run.commits.length };
}
//# sourceMappingURL=plan.mjs.map