import { type ResolvedPhases } from "../../lib/profiles.mts";
import { isEntrypoint } from "../../lib/entrypoint.mts";
import { type Toolchain } from "../../lib/toolchains.mts";
import { type NextTask } from "./state.mts";
/** The ledger file the loop reads its next task from. */
export declare const STATE_FILE = "STATE.md";
/**
 * The per-repo half, identical in shape to `ImplementConfig` — the escape
 * hatches are the same because the reason for them is: everything keyed off the
 * provider is the kit's, everything that names a package manager is the repo's.
 */
export interface TaskConfig {
    /** This repo's toolchain; picking one selects the kit's standard for it. */
    toolchain: Toolchain;
    /** Checks the toolchain name cannot imply. Appended under the standard block. */
    extraConventions?: string;
    /** Sandbox warm-up beyond the toolchain's own, e.g. a generated-file step. */
    preflight?: () => string[];
    /** Workspace-relative template override directory, e.g. `.sandcastle/templates`. */
    templateDir?: string;
}
export type CliOptions = {
    iterations: number;
    task?: string;
    profile?: string;
    model?: string;
};
export declare function parseCli(argv?: string[]): CliOptions;
/** The ledger's next recommendation. A malformed ledger stops the loop. */
export declare function nextTaskFromLedger(stateMd: string): NextTask;
/**
 * One iteration: deliver and verify one task in a warm sandbox on its own
 * branch, then PR it and squash-merge. The branch is pushed either way — a
 * failed verification leaves it up for inspection with no PR.
 */
export declare function runIteration(config: TaskConfig, run: ResolvedPhases, next: NextTask): Promise<{
    prUrl: string;
}>;
export type MainDeps = {
    /** `git pull --ff-only origin main`; false when main could not fast-forward. */
    syncMain: () => Promise<boolean>;
    /** Read the ledger's next recommended task. */
    nextTask: () => NextTask;
    runIteration: (run: ResolvedPhases, next: NextTask) => Promise<{
        prUrl: string;
    }>;
    log?: (message: string) => void;
};
/**
 * The loop: sync main, take the next task, deliver it, repeat. An explicit
 * `--task` pins only the FIRST iteration — the rest follow the ledger, which the
 * previous iteration's session just updated.
 */
export declare function main(options: CliOptions, deps: MainDeps): Promise<string[]>;
/**
 * The consumer entrypoint. A repo's `.sandcastle/config.mts` calls this behind
 * `isEntrypoint(import.meta.url)`, which keeps the consumer contract at one file.
 */
export declare function runTaskLoop(config: TaskConfig, argv?: string[]): Promise<string[]>;
export { isEntrypoint };
export { parseNextTask, taskBranch, taskSlug, type NextTask } from "./state.mts";
//# sourceMappingURL=index.d.mts.map