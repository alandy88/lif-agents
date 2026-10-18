/** One checklist item, in body order. */
export type TaskItem = {
    text: string;
    checked: boolean;
};
/**
 * Parse the ordered task-list out of an issue body. Only task-list lines count
 * — prose, bare bullets, and code never sneak into the plan. Order is
 * top-to-bottom body order (the author-controlled list IS the order; no
 * dependency graph).
 */
export declare function parseTaskList(body: string): TaskItem[];
/**
 * Return `body` with the `index`-th (1-based, task-list order) checkbox
 * checked. Out-of-range indices return the body unchanged — check-off is a
 * display update and must never throw mid-loop.
 */
export declare function checkOffTask(body: string, index: number): string;
/** The trailer recorded on the branch for a completed task. */
export declare function taskDoneTrailer(index: number): string;
/**
 * Parse the set of completed task indices out of a `git log` text blob.
 * Anchored to the start of a (possibly indented) line — git indents trailer
 * lines under the default log format — so a stray `Task-Done:` in prose does
 * not match.
 */
export declare function parseTaskDoneTrailers(logStdout: string): Set<number>;
/**
 * Render the checklist for a task prompt: numbered, with done/pending markers
 * reflecting BOTH surfaces (body checkbox or branch trailer), so the agent sees
 * exactly what the loop considers done.
 */
export declare function renderTaskList(tasks: TaskItem[], done: Set<number>): string;
/**
 * Remove the canonical `## Tasks` section before embedding the issue body in a
 * task prompt. The separately rendered task list is authoritative and reflects
 * trailer state; retaining the body section would show a stale second copy.
 */
export declare function stripTaskSection(body: string): string;
//# sourceMappingURL=task-list.d.mts.map