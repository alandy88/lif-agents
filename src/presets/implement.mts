// The issue-driven lifecycle, extracted from comfyui-lif-nodes'
// `.sandcastle/workflows/implement/main.mts`:
//
//   guards → resume from Task-Done trailers → plan (only when the issue body has
//   no checklist) → one fresh agent session per unchecked task → review → PR.
//
// Behaviour-preserving relative to the donor. The three things the donor read
// from its own `.sandcastle/config.mts` — agent construction, the sandbox
// provider, and the preflight commands — are now injected as `ImplementConfig`,
// and the prompt templates resolve through `templatePath()` so a consumer can
// override any of them by path.
//
// The lifecycle stages themselves live in `../phases/`; what is left here is the
// composition glue — guards, the issue/PR adapter, and the order the phases run
// in.

import { writeFileSync } from "node:fs";
import {
  commitOnBranch,
  dropArtifacts,
  logSince,
  push,
  pushCheckpoint,
} from "../lib/branch.mts";
import {
  githubIssueSource,
  issueIsEpic,
  type Issue,
  type IssueBodySource,
} from "../lib/github-issue.mts";
import {
  checkOffTask,
  parseTaskDoneTrailers,
  renderTaskList,
  stripTaskSection,
  taskDoneTrailer,
} from "../lib/task-list.mts";
import { ensureTaskList, runTaskLoop } from "../lib/task-loop.mts";
import { describeRun, forwardedEnvKeys, type ResolvedPhases } from "../lib/profiles.mts";
import {
  admit,
  type Admission,
  type IntakeRequest,
  type RejectionKind,
} from "../lib/issue-intake.mts";
import { assertKnownFlags, readFlag } from "../lib/cli.mts";
import { isEntrypoint } from "../lib/entrypoint.mts";
import { openRun, type RepoConfig, type RunDeps } from "../lib/run.mts";
import { renderConventions } from "../lib/toolchains.mts";
import { runPlanPhase } from "../phases/plan.mts";
import { runTaskPhase } from "../phases/task.mts";
import { runReviewPhase } from "../phases/review.mts";
import { deliverPullRequest } from "../lib/github-pr.mts";

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

export function parseCli(argv: string[] = process.argv.slice(2)): CliOptions {
  assertKnownFlags(argv, ["--issue", "--profile", "--model", "--trigger"]);
  const rawIssue = readFlag(argv, "--issue");
  if (!rawIssue || !/^\d+$/.test(rawIssue) || Number(rawIssue) < 1) {
    throw new Error("--issue must be a positive GitHub issue number");
  }

  return {
    issue: Number(rawIssue),
    profile: readFlag(argv, "--profile"),
    model: readFlag(argv, "--model"),
    trigger: readFlag(argv, "--trigger"),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Backstop cap on checklist length — a 30-item list is a mis-scoped issue,
 *  not a plan (the planner is told 2–8; a human authoring more should split
 *  the issue instead of feeding one sandcastle-agent run a marathon). */
const MAX_TASKS = 12;

/** Run artifacts tracked on the agent branch: the cross-session deviations log
 *  the task sessions append to, and the reviewer's PR-body summary. Both live on
 *  the branch (not /tmp) so they survive a resumed run, and both are stripped by
 *  the host before the PR so they never reach main. */
const NOTES_FILE = "AGENT_NOTES.md";
const SUMMARY_FILE = "AGENT_SUMMARY.md";

/**
 * What a session sees in place of an absent or empty notes file. Stated rather
 * than blank: an empty `<notes>` block reads as "notes were not kept", which
 * invites a session to re-derive decisions that were in fact never made.
 */
export const NO_NOTES_PLACEHOLDER =
  "(No deviations logged yet — nothing so far has forced a departure from the plan.)";

/** Trim a `cat`-ed artifact to its prompt form; empty and missing collapse. */
export function renderNotes(raw: string): string {
  const body = raw.trim();
  return body.length > 0 ? body : NO_NOTES_PLACEHOLDER;
}

export { describeRun };

/**
 * The PR body for a run: the issue link and model line, plus the reviewer's
 * summary when it produced one. On an autonomous run this body is the only
 * review surface, so a missing summary is called out rather than silently
 * yielding the bare one-liner the pipeline used to post.
 */
export function renderPrBody(issueNumber: number, run: ResolvedPhases, summary: string): string {
  const trimmed = summary.trim();
  return [
    `Closes #${issueNumber}.`,
    "",
    `Automated sandcastle-agent run (${describeRun(run)}).`,
    "",
    trimmed.length > 0
      ? trimmed
      : `> The review session left no ${SUMMARY_FILE}; this diff has not been summarized. Read it in full.`,
  ].join("\n");
}

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
export async function runIssue(
  config: ImplementConfig,
  run: ResolvedPhases,
  issueNumber: number,
  issue: Issue,
  issueSource: IssueBodySource,
  runDeps?: RunDeps,
): Promise<{ prUrl: string }> {
  const branch = `agent/issue-${issueNumber}`;

  // `openRun` owns the resume (and its ordering against sandbox creation).
  await using opened = await openRun({ config, run, branch }, runDeps);

  // The resume set. Read AFTER the run opens, because `openRun` is what
  // recreates the local branch from origin — on a fresh CI checkout the branch
  // does not exist locally until then, and reading first would return an empty
  // set and rebuild every task the prior run already landed. It stays here
  // rather than moving into `openRun` because it is not part of the scaffold:
  // the ledger loop has no checklist and no trailers.
  const done = parseTaskDoneTrailers(await logSince(branch));

  /** Read a run artifact off the branch; absent and unreadable both read empty
   *  (`|| true` keeps a missing file from surfacing as a failed exec). */
  const readArtifact = async (file: string): Promise<string> => {
    const read = await opened.sandbox.exec(`cat ${file} 2>/dev/null || true`);
    return read.exitCode === 0 ? read.stdout : "";
  };
  // `BRANCH` is injected by the phase from `ctx.branch`.
  const baseArgs = {
    ISSUE_NUMBER: String(issueNumber),
    ISSUE_TITLE: issue.title,
    CONVENTIONS: renderConventions(config.toolchain, config.extraConventions),
  };

  // Ensure the checklist, running the planner session when the body lacks one.
  // The planner edits the issue body itself via gh (it holds GH_TOKEN); the
  // host re-fetches and re-parses, so the issue is the single source of the plan.
  let issueBody = issue.body;
  const { tasks, planned } = await ensureTaskList(issueBody, {
    plan: async () => {
      await runPlanPhase(opened.ctx.plan, {
        args: { ...baseArgs, ISSUE_BODY: issueBody },
        name: `plan-${issueNumber}`,
      });
    },
    refetchBody: async () => {
      issueBody = (await issueSource.getIssue(issueNumber)).body;
      return issueBody;
    },
  });
  if (planned) console.log(`Planner produced ${tasks.length} task(s).`);
  if (tasks.length > MAX_TASKS) {
    throw new Error(
      `Issue #${issueNumber} has ${tasks.length} checklist tasks (cap ${MAX_TASKS}); split it into smaller issues.`,
    );
  }

  const result = await runTaskLoop(tasks, done, {
    runTask: async (index, task, attempt) => {
      // Injected, not merely mentioned: a session told to "read the notes file
      // if it exists" frequently won't, which is the exact cross-session
      // amnesia the file exists to fix.
      return runTaskPhase(opened.ctx.task, {
        args: {
          ...baseArgs,
          ISSUE_BODY: stripTaskSection(issueBody),
          NOTES: renderNotes(await readArtifact(NOTES_FILE)),
          TASK_INDEX: String(index),
          TASK_COUNT: String(tasks.length),
          TASK_TEXT: task.text,
          TASK_LIST: renderTaskList(tasks, done),
        },
        name: `task-${issueNumber}-${index}${attempt > 1 ? "-retry" : ""}`,
      });
    },
    recordDone: async (index) => {
      // An empty commit carrying only the trailer (the task's work is already
      // committed by the session).
      await commitOnBranch(opened.sandbox, `chore(tasks): complete task ${index}`, {
        trailer: taskDoneTrailer(index),
      });
    },
    checkOff: async (index) => {
      // Display only — the trailer above is the durable state, so a gh hiccup
      // here must never fail the loop.
      try {
        const current = await issueSource.getIssue(issueNumber);
        await issueSource.setBody(issueNumber, checkOffTask(current.body, index));
      } catch (error) {
        console.error(`Could not check off task ${index} on the issue: ${errorMessage(error)}`);
      }
    },
    // Mid-loop push is the crash-resilience push; the terminal push below still
    // throws, so a transient failure here only narrows the checkpoint.
    pushBranch: async () => {
      await pushCheckpoint(branch);
    },
    log: (message) => console.log(message),
  });

  if (result.kind === "stuck") {
    const stuckTask = tasks[result.taskIndex - 1]!;
    const detail =
      `Task ${result.taskIndex}/${tasks.length} ("${stuckTask.text}") made no commits after a retry. ` +
      `Completed this run: ${result.completed.length}; remaining unbuilt: ${result.remaining.length}. ` +
      `Completed work is pushed on \`${branch}\` and resumes from the Task-Done trailers on re-run.`;
    await issueSource.comment(issueNumber, detail).catch((commentError) => {
      console.error(`Could not report the stuck task on the issue: ${errorMessage(commentError)}`);
    });
    throw new Error(detail);
  }

  const review = await runReviewPhase(opened.ctx.review, {
    // Full body here (not stripTaskSection): the reviewer's spec axis walks the
    // `## Tasks` checklist against the diff, so it needs the section verbatim.
    args: {
      ...baseArgs,
      ISSUE_BODY: issueBody,
      NOTES: renderNotes(await readArtifact(NOTES_FILE)),
    },
    name: `review-${issueNumber}`,
    summaryFile: SUMMARY_FILE,
  });
  console.log(
    `Tasks: ${result.completed.length} built, ${result.skippedDone.length} resumed; ` +
      `review: ${review.commits} commit(s).`,
  );

  // Strip both artifacts — the deletion is the host's job, not an instruction
  // the review session has to remember, so a forgetful reviewer cannot leak
  // scratch files onto main.
  await dropArtifacts(opened.sandbox, [NOTES_FILE, SUMMARY_FILE]);

  await push(branch);

  const { prUrl } = await deliverPullRequest({
    branch,
    title: `Fix #${issueNumber}: ${issue.title}`,
    body: renderPrBody(issueNumber, run, review.summary),
  });
  return { prUrl };
}

export type MainDeps = {
  issueSource: IssueBodySource;
  admit: (request: IntakeRequest) => Promise<Admission>;
  runIssue: (
    run: ResolvedPhases,
    issueNumber: number,
    issue: Issue,
    issueSource: IssueBodySource,
  ) => Promise<{ prUrl: string }>;
  env: Record<string, string | undefined>;
};

/**
 * One report-then-throw site, but still one diagnostic per guard: an
 * unattended Actions log should say which rejection could not be posted.
 */
const COMMENT_FAILURE: Record<RejectionKind, string> = {
  closed: "Could not report closed-issue error",
  epic: "Could not report epic error",
  configuration: "Could not report configuration error",
};

/**
 * Admit, then act on the verdict: a rejection is reported on the issue and
 * rethrown (the only report-then-throw site left, now that the four guards
 * live in `admit`), a skip returns cleanly, and an admission runs the
 * checklist task loop, writes the sandbox's forwarded-env file under CI, and
 * reports the resulting PR back on the issue. Returns "skipped" for the clean
 * no-op path, "ran" otherwise.
 */
export async function main(options: CliOptions, deps: MainDeps): Promise<"ran" | "skipped"> {
  const { issueSource } = deps;
  const admission = await deps.admit({
    issueNumber: options.issue,
    trigger: options.trigger,
    dispatchProfile: options.profile,
    modelOverride: options.model,
    defaultProfile: deps.env.AGENT_DEFAULT_PROFILE,
  });

  if (admission.kind === "skipped") {
    console.log(admission.reason);
    return "skipped";
  }

  if (admission.kind === "rejected") {
    console.error(admission.detail);
    await issueSource.comment(options.issue, admission.detail).catch((commentError) => {
      console.error(
        `${COMMENT_FAILURE[admission.because]} on the issue: ${errorMessage(commentError)}`,
      );
    });
    throw admission.cause ?? new Error(admission.detail);
  }

  const { issue, run } = admission;

  // CI never checks in a .sandcastle/.env; declare the forwarded keys here,
  // AFTER profile resolution, so the sibling sandbox only receives the resolved
  // provider's credentials (values stay in the Actions process environment).
  if (deps.env.GITHUB_ACTIONS === "true") {
    writeFileSync(
      ".sandcastle/.env",
      forwardedEnvKeys(Object.values(run.phases))
        .map((key) => `${key}=\n`)
        .join(""),
    );
  }

  console.log(`Issue #${options.issue}: ${issue.title}`);
  console.log(`Profile: ${describeRun(run)}`);

  const { prUrl } = await deps.runIssue(run, options.issue, issue, deps.issueSource);
  console.log(`PR: ${prUrl}`);

  await issueSource
    .comment(options.issue, `sandcastle-agent run complete (${describeRun(run)}): ${prUrl}`)
    .catch((commentError) => {
      console.error(`Could not report the PR on the issue: ${errorMessage(commentError)}`);
    });

  return "ran";
}

/**
 * The consumer entrypoint: everything above wired to the real GitHub issue
 * source and `process.argv`. A repo's `.sandcastle/config.mts` calls this behind
 * `isEntrypoint(import.meta.url)`, which is what keeps the consumer contract at
 * one file.
 */
export function runImplementLoop(
  config: ImplementConfig,
  argv?: string[],
): Promise<"ran" | "skipped"> {
  return main(parseCli(argv), {
    issueSource: githubIssueSource,
    admit: (request) => admit(request, { getIssue: githubIssueSource.getIssue, issueIsEpic }),
    runIssue: (run, issueNumber, issue, issueSource) =>
      runIssue(config, run, issueNumber, issue, issueSource),
    env: process.env,
  });
}

export { isEntrypoint };
