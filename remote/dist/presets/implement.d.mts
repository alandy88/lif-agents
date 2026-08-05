import { type Issue, type IssueBodySource } from "../lib/github-issue.mts";
import { describeRun, type ResolvedPhases } from "../lib/profiles.mts";
import { type Admission, type IntakeRequest } from "../lib/issue-intake.mts";
import { readFlag } from "../lib/cli.mts";
import { isEntrypoint } from "../lib/entrypoint.mts";
import { type RepoConfig, type RunDeps } from "../lib/run.mts";
/**
 * The per-repo half of the pipeline. An alias rather than its own interface:
 * `openRun` consumes every field, and the ledger preset needs the identical
 * shape, so one definition in `lib/run.mts` is the only way the two presets
 * cannot drift. The name stays exported because consumers annotate with it.
 */
export type ImplementConfig = RepoConfig;
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
 *
 * `runDeps` is `openRun`'s seam, passed through so a test can drive this whole
 * lifecycle against a fake sandbox. Defaulted, so `runImplementLoop` is unchanged.
 */
export declare function runIssue(config: ImplementConfig, run: ResolvedPhases, issueNumber: number, issue: Issue, issueSource: IssueBodySource, runDeps?: RunDeps): Promise<{
    prUrl: string;
}>;
export type MainDeps = {
    issueSource: IssueBodySource;
    admit: (request: IntakeRequest) => Promise<Admission>;
    runIssue: (run: ResolvedPhases, issueNumber: number, issue: Issue, issueSource: IssueBodySource) => Promise<{
        prUrl: string;
    }>;
    env: Record<string, string | undefined>;
};
/**
 * Admit, then act on the verdict: a rejection is reported on the issue and
 * rethrown (the only report-then-throw site left, now that the four guards
 * live in `admit`), a skip returns cleanly, and an admission runs the
 * checklist task loop, writes the sandbox's forwarded-env file under CI, and
 * reports the resulting PR back on the issue. Returns "skipped" for the clean
 * no-op path, "ran" otherwise.
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