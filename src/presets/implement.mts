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

import { writeFileSync } from "node:fs";
import { createSandbox } from "@ai-hero/sandcastle";
import { ghCapture, ghJson, hostGit } from "../lib/host-exec.mts";
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
import {
  forwardedEnvKeys,
  MIXED_PROFILE_NAME,
  resolvePhases,
  type ResolvedPhases,
} from "../lib/profiles.mts";
import { defangPromptArgs } from "../lib/defang.mts";
import { templatePath } from "../lib/templates.mts";
import { isEntrypoint } from "../lib/entrypoint.mts";
import {
  createAgent,
  createSandboxProvider,
  providerPreflight,
} from "../lib/provider-setup.mts";
import { renderConventions, toolchains, type Toolchain } from "../lib/toolchains.mts";

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

export function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

export function parseCli(argv: string[] = process.argv.slice(2)): CliOptions {
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

/** Git identity for the host-issued commits; the sandbox has no global one. */
const BOT_IDENTITY =
  `-c user.name='sandcastle-agent[bot]' ` +
  `-c user.email='sandcastle-agent[bot]@users.noreply.github.com'`;

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

/** One line naming the models a run uses, for logs, comments, and the PR body. */
export function describeRun(run: ResolvedPhases): string {
  if (run.name !== MIXED_PROFILE_NAME) return `${run.name} → ${run.phases.task.model}`;
  return `mixed → plan ${run.phases.plan.model}, tasks ${run.phases.task.model}, review ${run.phases.review.model}`;
}

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
 */
export async function runIssue(
  config: ImplementConfig,
  run: ResolvedPhases,
  issueNumber: number,
  issue: Issue,
  issueSource: IssueBodySource,
): Promise<{ prUrl: string }> {
  const branch = `agent/issue-${issueNumber}`;
  const prompt = (name: string) =>
    templatePath(`implement/${name}`, { overrideDir: config.templateDir });

  // Resume: when a prior run pushed this branch, recreate it locally from
  // origin so the sandbox continues it (and its trailers) instead of starting
  // a fresh branch that could never fast-forward-push.
  const originBranch = await hostGit(["rev-parse", "--verify", "--quiet", `origin/${branch}`]);
  if (originBranch.exitCode === 0) {
    await hostGit(["branch", "--force", branch, `origin/${branch}`]);
  }
  const trailerLog = await hostGit(["log", `origin/main..${branch}`]);
  const done =
    trailerLog.exitCode === 0 ? parseTaskDoneTrailers(trailerLog.stdout) : new Set<number>();

  // Toolchain warm-up, then repo extras, then provider auth — the donor's
  // order, and the one that fails on a missing toolchain before it fails on a
  // missing credential.
  const preflight = [
    ...toolchains[config.toolchain].preflight,
    ...(config.preflight?.() ?? []),
    ...providerPreflight(Object.values(run.phases)),
  ];

  await using sandbox = await createSandbox({
    branch,
    sandbox: createSandboxProvider(),
    hooks: {
      sandbox: {
        onSandboxReady: preflight.map((command) => ({ command })),
      },
    },
  });

  const agents = {
    plan: createAgent(run.phases.plan),
    task: createAgent(run.phases.task),
    review: createAgent(run.phases.review),
  };

  /** Read a run artifact off the branch; absent and unreadable both read empty
   *  (`|| true` keeps a missing file from surfacing as a failed exec). */
  const readArtifact = async (file: string): Promise<string> => {
    const read = await sandbox.exec(`cat ${file} 2>/dev/null || true`);
    return read.exitCode === 0 ? read.stdout : "";
  };
  const baseArgs = {
    ISSUE_NUMBER: String(issueNumber),
    ISSUE_TITLE: issue.title,
    BRANCH: branch,
    CONVENTIONS: renderConventions(config.toolchain, config.extraConventions),
  };

  // Ensure the checklist, running the planner session when the body lacks one.
  // The planner edits the issue body itself via gh (it holds GH_TOKEN); the
  // host re-fetches and re-parses, so the issue is the single source of the plan.
  let issueBody = issue.body;
  const { tasks, planned } = await ensureTaskList(issueBody, {
    plan: async () => {
      await sandbox.run({
        agent: agents.plan,
        promptFile: prompt("plan-prompt.md"),
        promptArgs: defangPromptArgs({ ...baseArgs, ISSUE_BODY: issueBody }),
        maxIterations: 2,
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
      const taskRun = await sandbox.run({
        agent: agents.task,
        promptFile: prompt("task-prompt.md"),
        promptArgs: defangPromptArgs({
          ...baseArgs,
          ISSUE_BODY: stripTaskSection(issueBody),
          NOTES: renderNotes(await readArtifact(NOTES_FILE)),
          TASK_INDEX: String(index),
          TASK_COUNT: String(tasks.length),
          TASK_TEXT: task.text,
          TASK_LIST: renderTaskList(tasks, done),
        }),
        maxIterations: 5,
        name: `task-${issueNumber}-${index}${attempt > 1 ? "-retry" : ""}`,
      });
      return { commits: taskRun.commits.length };
    },
    recordDone: async (index) => {
      // An empty commit carrying only the trailer (the task's work is already
      // committed by the session). Identity is pinned inline; the sandbox has no
      // global git identity of its own.
      await sandbox.exec(
        `git ${BOT_IDENTITY} ` +
          `commit --allow-empty -m 'chore(tasks): complete task ${index}' --trailer '${taskDoneTrailer(index)}'`,
      );
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
    pushBranch: async () => {
      const push = await hostGit(["push", "-u", "origin", branch]);
      if (push.exitCode !== 0) {
        // Mid-loop push is the crash-resilience push; the terminal push below
        // still throws, so a transient failure here only narrows the checkpoint.
        console.error(`Mid-loop git push origin ${branch} exited ${push.exitCode}; continuing.`);
      }
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

  const review = await sandbox.run({
    agent: agents.review,
    promptFile: prompt("review-prompt.md"),
    // Full body here (not stripTaskSection): the reviewer's spec axis walks the
    // `## Tasks` checklist against the diff, so it needs the section verbatim.
    promptArgs: defangPromptArgs({
      ...baseArgs,
      ISSUE_BODY: issueBody,
      NOTES: renderNotes(await readArtifact(NOTES_FILE)),
    }),
    name: `review-${issueNumber}`,
  });
  console.log(
    `Tasks: ${result.completed.length} built, ${result.skippedDone.length} resumed; ` +
      `review: ${review.commits.length} commit(s).`,
  );

  // Harvest the reviewer's summary, then strip both artifacts — the deletion is
  // the host's job, not an instruction the review session has to remember, so a
  // forgetful reviewer cannot leak scratch files onto main.
  const summary = await readArtifact(SUMMARY_FILE);
  const tracked = await sandbox.exec(`git ls-files -- ${NOTES_FILE} ${SUMMARY_FILE}`);
  if (tracked.stdout.trim().length > 0) {
    await sandbox.exec(
      // -f: the review session may have left an artifact dirty in the worktree,
      // and a plain `git rm` refuses on modified files.
      `git rm -q -f --ignore-unmatch ${NOTES_FILE} ${SUMMARY_FILE} && ` +
        `git ${BOT_IDENTITY} commit -m 'chore(agent): drop run artifacts'`,
    );
  }

  const push = await hostGit(["push", "-u", "origin", branch]);
  if (push.exitCode !== 0) {
    throw new Error(`git push origin ${branch} exited ${push.exitCode}`);
  }

  const body = renderPrBody(issueNumber, run, summary);
  const created = await ghCapture([
    "pr",
    "create",
    "--head",
    branch,
    "--base",
    "main",
    "--title",
    `Fix #${issueNumber}: ${issue.title}`,
    "--body",
    body,
  ]);

  if (created.exitCode === 0) return { prUrl: created.stdout.trim() };

  // gh pr create exits non-zero when a PR for the branch already exists (a
  // re-run on the same issue); look it up, and refresh the body so a resumed
  // run's PR describes the work as it now stands rather than as it stood when
  // the first run stopped.
  const prUrl = (await ghJson(["pr", "view", branch, "--json", "url", "--jq", ".url"])).trim();
  const edited = await ghCapture(["pr", "edit", branch, "--body", body]);
  if (edited.exitCode !== 0) {
    console.error(`Could not refresh the PR body on ${branch}; it still describes the prior run.`);
  }

  return { prUrl };
}

export type MainDeps = {
  issueSource: IssueBodySource;
  issueIsEpic: (issueNumber: number) => Promise<boolean>;
  runIssue: (
    run: ResolvedPhases,
    issueNumber: number,
    issue: Issue,
    issueSource: IssueBodySource,
  ) => Promise<{ prUrl: string }>;
  env: Record<string, string | undefined>;
};

/**
 * The guarded single-issue flow: reject closed issues and epics (with an issue
 * comment), skip cleanly when the triggering label was removed while queued,
 * resolve the model profile, then run the checklist task loop and report the PR
 * back on the issue. Returns "skipped" for the clean no-op path, "ran" otherwise.
 */
export async function main(options: CliOptions, deps: MainDeps): Promise<"ran" | "skipped"> {
  const { issueSource } = deps;
  const labelTriggered = options.trigger === "issues";
  const issue = await issueSource.getIssue(options.issue);

  if (issue.state === "CLOSED") {
    const detail = `Issue #${options.issue} is closed; the sandcastle-agent run requires an open issue.`;
    console.error(detail);
    await issueSource.comment(options.issue, detail).catch((commentError) => {
      console.error(
        `Could not report closed-issue error on the issue: ${errorMessage(commentError)}`,
      );
    });
    throw new Error(detail);
  }

  if (labelTriggered && !issue.labels.includes("ready-for-agent")) {
    console.log(
      `Issue #${options.issue} no longer has the ready-for-agent label (removed while queued) — skipping.`,
    );
    return "skipped";
  }

  if (await deps.issueIsEpic(options.issue)) {
    const detail =
      `Issue #${options.issue} has native GitHub sub-issues (it's an epic); the sandcastle-agent run ` +
      `only handles atomic issues. Run the sub-issues individually instead.`;
    console.error(detail);
    await issueSource.comment(options.issue, detail).catch((commentError) => {
      console.error(`Could not report epic error on the issue: ${errorMessage(commentError)}`);
    });
    throw new Error(detail);
  }

  let run;
  try {
    run = resolvePhases({
      labels: issue.labels,
      dispatchProfile: options.profile,
      defaultProfile: deps.env.AGENT_DEFAULT_PROFILE,
      modelOverride: options.model,
    });
  } catch (error) {
    const detail = `sandcastle-agent configuration rejected: ${errorMessage(error)}`;
    console.error(detail);
    await issueSource.comment(options.issue, detail).catch((commentError) => {
      console.error(
        `Could not report configuration error on the issue: ${errorMessage(commentError)}`,
      );
    });
    throw error;
  }

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
    issueIsEpic,
    runIssue: (run, issueNumber, issue, issueSource) =>
      runIssue(config, run, issueNumber, issue, issueSource),
    env: process.env,
  });
}

export { isEntrypoint };
