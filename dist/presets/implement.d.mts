import type { AgentProvider, SandboxProvider } from "@ai-hero/sandcastle";
import { type Issue, type IssueBodySource } from "../lib/github-issue.mts";
import { type ModelProfile, type ResolvedPhases } from "../lib/profiles.mts";
import { isEntrypoint } from "../lib/entrypoint.mts";
/**
 * The per-repo half of the pipeline — everything the preset cannot know. This
 * is what a consumer's `.sandcastle/config.mts` is.
 */
export interface ImplementConfig {
    /** Build the agent for one resolved phase profile (claude / codex / …). */
    createAgent: (profile: ModelProfile) => AgentProvider;
    /** The sandbox provider, e.g. `docker()`. */
    createSandboxProvider: () => SandboxProvider;
    /** Commands run inside the sandbox once ready, before the first agent turn. */
    preflightCommands: (profiles: readonly ModelProfile[]) => string[];
    /**
     * The repo's toolchain rules, injected as `{{CONVENTIONS}}` — the test, lint,
     * and formatting commands a session must run before committing. This is the
     * one place the kit's default templates name a package manager.
     */
    conventions: string;
    /** The canonical test command, injected as `{{VERIFY}}` into the review prompt. */
    verify: string;
    /** Workspace-relative template override directory, e.g. `.sandcastle/templates`. */
    templateDir?: string;
}
export type CliOptions = {
    issue: number;
    profile?: string;
    model?: string;
    trigger?: string;
};
export declare function readFlag(argv: string[], name: string): string | undefined;
export declare function parseCli(argv?: string[]): CliOptions;
/**
 * What a session sees in place of an absent or empty notes file. Stated rather
 * than blank: an empty `<notes>` block reads as "notes were not kept", which
 * invites a session to re-derive decisions that were in fact never made.
 */
export declare const NO_NOTES_PLACEHOLDER = "(No deviations logged yet \u2014 nothing so far has forced a departure from the plan.)";
/** Trim a `cat`-ed artifact to its prompt form; empty and missing collapse. */
export declare function renderNotes(raw: string): string;
/** One line naming the models a run uses, for logs, comments, and the PR body. */
export declare function describeRun(run: ResolvedPhases): string;
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