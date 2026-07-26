import { type Issue, type IssueBodySource } from "../lib/github-issue.mts";
import { describeRun, type ResolvedPhases } from "../lib/profiles.mts";
import { readFlag } from "../lib/cli.mts";
import { isEntrypoint } from "../lib/entrypoint.mts";
import { type Toolchain } from "../lib/toolchains.mts";
/**
 * The per-repo half of the pipeline — and only that half. Everything keyed off
 * `profile.provider` (agent construction, credential materialization, the CLI
 * smoke check) is the kit's, because a consumer writing it would be copying the
 * same block into every repo. What is left here cannot be written without
 * naming this repo's package manager or test command, which is exactly the
 * PRD's module-boundary test.
 */
export interface ImplementConfig {
    /**
     * This repo's toolchain. Picking one selects the kit's standard for it —
     * `python` means uv, `node` means npm — which drives the sandbox warm-up and
     * the checks the prompts tell a session to run. The kit owns the commands so
     * three repos cannot drift into three dialects of the same toolchain.
     */
    toolchain: Toolchain;
    /**
     * Checks the toolchain name cannot imply: a second test suite, a generated
     * file to refresh. Appended under the standard block. Not for restating the
     * toolchain's own commands.
     */
    extraConventions?: string;
    /**
     * Sandbox warm-up beyond the toolchain's own, e.g. a docs-generation step.
     * The toolchain's commands and provider authentication are both the kit's
     * job — this is only what neither can know.
     */
    preflight?: () => string[];
    /** Workspace-relative template override directory, e.g. `.sandcastle/templates`. */
    templateDir?: string;
}
export type CliOptions = {
    issue: number;
    profile?: string;
    model?: string;
    trigger?: string;
};
export { readFlag };
export declare function parseCli(argv?: string[]): CliOptions;
/**
 * What a session sees in place of an absent or empty notes file. Stated rather
 * than blank: an empty `<notes>` block reads as "notes were not kept", which
 * invites a session to re-derive decisions that were in fact never made.
 */
export declare const NO_NOTES_PLACEHOLDER = "(No deviations logged yet \u2014 nothing so far has forced a departure from the plan.)";
/** Trim a `cat`-ed artifact to its prompt form; empty and missing collapse. */
export declare function renderNotes(raw: string): string;
export { describeRun };
/**
 * The PR body for a run: the issue link and model line, plus the reviewer's
 * summary when it produced one. On an autonomous run this body is the only
 * review surface, so a missing summary is called out rather than silently
 * yielding the bare one-liner the pipeline used to post.
 */
export declare function renderPrBody(issueNumber: number, run: ResolvedPhases, summary: string): string;
/**
 * The sandbox half — the checklist ralph loop inside one warm container on
 * branch agent/issue-<n>:
 *
 *   ensure checklist (plan session when absent) → one fresh agent session per
 *   unchecked task, recording a Task-Done trailer + checking the box off after
 *   each → review session → push → PR.
 *
 * The branch is the durable checkpoint: it is pushed after every green task and
 * the Task-Done trailers are the resume set, so a re-fired run skips completed
 * tasks instead of starting over.
 */
export declare function runIssue(config: ImplementConfig, run: ResolvedPhases, issueNumber: number, issue: Issue, issueSource: IssueBodySource): Promise<{
    prUrl: string;
}>;
export type MainDeps = {
    issueSource: IssueBodySource;
    issueIsEpic: (issueNumber: number) => Promise<boolean>;
    runIssue: (run: ResolvedPhases, issueNumber: number, issue: Issue, issueSource: IssueBodySource) => Promise<{
        prUrl: string;
    }>;
    env: Record<string, string | undefined>;
};
/**
 * The guarded single-issue flow: reject closed issues and epics (with an issue
 * comment), skip cleanly when the triggering label was removed while queued,
 * resolve the model profile, then run the checklist task loop and report the PR
 * back on the issue. Returns "skipped" for the clean no-op path, "ran" otherwise.
 */
export declare function main(options: CliOptions, deps: MainDeps): Promise<"ran" | "skipped">;
/**
 * The consumer entrypoint: everything above wired to the real GitHub issue
 * source and `process.argv`. A repo's `.sandcastle/config.mts` calls this behind
 * `isEntrypoint(import.meta.url)`, which is what keeps the consumer contract at
 * one file.
 */
export declare function runImplementLoop(config: ImplementConfig, argv?: string[]): Promise<"ran" | "skipped">;
export { isEntrypoint };
//# sourceMappingURL=implement.d.mts.map