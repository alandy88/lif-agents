// Plan phase — slice the work into a checklist. The planner edits the source of
// truth itself (today: the GitHub issue body, via `gh`); the host re-reads it,
// so the phase only reports whether the session ran and what it committed.

import { runPhaseSession, type PhaseContext, type PhaseInput } from "./context.mts";

/** The phase's default prompt; a preset with its own passes `input.template`. */
export const PLAN_TEMPLATE = "implement/plan-prompt.md";

export interface PlanResult {
  commits: number;
}

export async function runPlanPhase(ctx: PhaseContext, input: PhaseInput): Promise<PlanResult> {
  const run = await runPhaseSession(ctx, input, { template: PLAN_TEMPLATE, maxIterations: 2 });
  return { commits: run.commits.length };
}
