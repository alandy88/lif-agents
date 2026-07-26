import { type TaskItem } from "./task-list.mts";
export type TaskLoopDeps = {
    /** Run ONE task in a fresh agent context; resolves the commit count it made. */
    runTask: (index: number, task: TaskItem, attempt: 1 | 2) => Promise<{
        commits: number;
    }>;
    /** Record the `Task-Done: <i>` trailer commit on the branch (durable state). */
    recordDone: (index: number) => Promise<void>;
    /** Check the box off on the issue (display; best-effort, caller may swallow). */
    checkOff: (index: number) => Promise<void>;
    /** Push the branch after each green task, so progress survives a dead runner. */
    pushBranch: () => Promise<void>;
    log?: (message: string) => void;
};
export type TaskLoopResult = {
    kind: "complete";
    completed: number[];
    skippedDone: number[];
} | {
    kind: "stuck";
    taskIndex: number;
    completed: number[];
    skippedDone: number[];
    remaining: number[];
};
/**
 * Work every not-yet-done task in order. `done` is the resume set from the
 * branch's Task-Done trailers; a task is skipped when its trailer exists OR its
 * body checkbox is already checked (a human pre-checking a box is an
 * instruction to skip it).
 */
export declare function runTaskLoop(tasks: TaskItem[], done: Set<number>, deps: TaskLoopDeps): Promise<TaskLoopResult>;
/**
 * Resolve the issue's task checklist, planning one when absent: parse the body;
 * when it has no task-list, run the injected planner (which edits the issue
 * body via gh) and re-fetch. A planner that still produced no checklist fails
 * the run — there is nothing well-defined to loop over.
 */
export declare function ensureTaskList(issueBody: string, deps: {
    plan: () => Promise<void>;
    refetchBody: () => Promise<string>;
}): Promise<{
    tasks: TaskItem[];
    planned: boolean;
}>;
//# sourceMappingURL=task-loop.d.mts.map