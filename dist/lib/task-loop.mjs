// The ralph loop: one fresh agent context per checklist task, in body order, on
// one warm sandbox + branch. Decision logic only — every effect (the agent run,
// the trailer commit, the issue check-off, the push) is INJECTED so the loop is
// unit-testable with fakes.
//
// Outcome tiers per task:
//   • landed (commits > 0)        → record trailer, check off, push, continue.
//   • no commits, first attempt   → retry ONCE with a fresh context.
//   • no commits after retry      → STOP: report the stuck task; later tasks
//     stay unbuilt (later-in-order is the dependency proxy — no building past a
//     failure). Completed work stays pushed for inspection; NO PR.
import { parseTaskList } from "./task-list.mjs";
/**
 * Work every not-yet-done task in order. `done` is the resume set from the
 * branch's Task-Done trailers; a task is skipped when its trailer exists OR its
 * body checkbox is already checked (a human pre-checking a box is an
 * instruction to skip it).
 */
export async function runChecklistLoop(tasks, done, deps) {
    const log = deps.log ?? (() => { });
    const completed = [];
    const skippedDone = [];
    for (let i = 1; i <= tasks.length; i++) {
        const task = tasks[i - 1];
        if (task.checked || done.has(i)) {
            log(`[task-loop] task ${i} already done; skipping`);
            skippedDone.push(i);
            continue;
        }
        let { commits } = await deps.runTask(i, task, 1);
        if (commits === 0) {
            log(`[task-loop] task ${i} made no commits; retrying once with a fresh context`);
            ({ commits } = await deps.runTask(i, task, 2));
        }
        if (commits === 0) {
            const remaining = [];
            for (let j = i + 1; j <= tasks.length; j++) {
                if (!tasks[j - 1].checked && !done.has(j))
                    remaining.push(j);
            }
            log(`[task-loop] task ${i} stuck after retry; stopping (${remaining.length} task(s) unbuilt)`);
            return { kind: "stuck", taskIndex: i, completed, skippedDone, remaining };
        }
        await deps.recordDone(i);
        done.add(i);
        await deps.checkOff(i);
        await deps.pushBranch();
        completed.push(i);
        log(`[task-loop] task ${i} done (${commits} commit(s))`);
    }
    return { kind: "complete", completed, skippedDone };
}
/**
 * Resolve the issue's task checklist, planning one when absent: parse the body;
 * when it has no task-list, run the injected planner (which edits the issue
 * body via gh) and re-fetch. A planner that still produced no checklist fails
 * the run — there is nothing well-defined to loop over.
 */
export async function ensureTaskList(issueBody, deps) {
    const existing = parseTaskList(issueBody);
    if (existing.length > 0)
        return { tasks: existing, planned: false };
    await deps.plan();
    const planned = parseTaskList(await deps.refetchBody());
    if (planned.length === 0) {
        throw new Error("The planner run did not leave a task checklist (`- [ ] ...`) in the issue body.");
    }
    return { tasks: planned, planned: true };
}
//# sourceMappingURL=task-loop.mjs.map