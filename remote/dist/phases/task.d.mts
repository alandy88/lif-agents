import { type PhaseContext, type PhaseInput } from "./context.mts";
/** The phase's default prompt; a preset with its own passes `input.template`. */
export declare const TASK_TEMPLATE = "implement/task-prompt.md";
export interface TaskResult {
    commits: number;
}
export declare function runTaskPhase(ctx: PhaseContext, input: PhaseInput): Promise<TaskResult>;
//# sourceMappingURL=task.d.mts.map