// Task phase — ONE fresh agent context delivering ONE unit of work on the run's
// branch. The shared inner unit of both shipped lifecycles: the issue-driven
// preset drives it from the checklist ralph loop, the ledger preset from
// STATE.md's next-task recommendation.
//
// Retry-on-no-commits deliberately stays OUTSIDE the phase: `implement` owns it
// in `lib/task-loop.mts` (where it is part of the stuck-task decision), and the
// ledger preset simply calls the phase twice. Commit count is the landing
// signal both of them branch on.
import { runPhaseSession } from "./context.mjs";
/** The phase's default prompt; a preset with its own passes `input.template`. */
export const TASK_TEMPLATE = "implement/task-prompt.md";
export async function runTaskPhase(ctx, input) {
    const run = await runPhaseSession(ctx, input, { template: TASK_TEMPLATE, maxIterations: 5 });
    return { commits: run.commits.length };
}
//# sourceMappingURL=task.mjs.map