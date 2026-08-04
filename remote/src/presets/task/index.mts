// The ledger lifecycle, ported from Morrow's `.sandcastle/workflows/task/main.mts`:
//
//   STATE.md's next task → task session (retried once) → fresh-context verify →
//   push → PR → squash-merge to main → repeat.
//
// No issue source and no checklist: PLAN.md is the plan and STATE.md is the
// ledger. The stages are the same `../../phases/` functions `presets/implement`
// composes — the task phase having two consumers is what earns the phase layer.

import { readFileSync } from "node:fs";
import { push, syncMain } from "../../lib/branch.mts";
import { assertKnownFlags, readFlag } from "../../lib/cli.mts";
import { describeRun, resolvePhases, type ResolvedPhases } from "../../lib/profiles.mts";
import { isEntrypoint } from "../../lib/entrypoint.mts";
import { openRun, type RepoConfig, type RunDeps } from "../../lib/run.mts";
import { renderConventions, toolchains } from "../../lib/toolchains.mts";
import { runTaskPhase } from "../../phases/task.mts";
import { runVerifyPhase } from "../../phases/verify.mts";
import { deliverPullRequest } from "../../lib/github-pr.mts";
import { parseNextTask, taskBranch, type NextTask } from "./state.mts";

/** The ledger preset's prompts; `templateDir` overrides them by the same path. */
const TASK_TEMPLATE = "task/task-prompt.md";
const VERIFY_TEMPLATE = "task/verify-prompt.md";

/** The ledger file the loop reads its next task from. */
export const STATE_FILE = "STATE.md";

/**
 * The per-repo half — the same `RepoConfig` the issue preset takes, and the
 * same alias for the same reason: the escape hatches are identical because the
 * reason for them is (everything keyed off the provider is the kit's,
 * everything that names a package manager is the repo's), so they are defined
 * once in `lib/run.mts` and cannot drift apart here.
 */
export type TaskConfig = RepoConfig;

export type CliOptions = {
  iterations: number;
  task?: string;
  profile?: string;
  model?: string;
};

export function parseCli(argv: string[] = process.argv.slice(2)): CliOptions {
  assertKnownFlags(argv, ["--iterations", "--task", "--profile", "--model"]);
  const rawIterations = readFlag(argv, "--iterations") ?? "1";
  if (!/^\d+$/.test(rawIterations) || Number(rawIterations) < 1 || Number(rawIterations) > 20) {
    throw new Error("--iterations must be a number between 1 and 20");
  }
  return {
    iterations: Number(rawIterations),
    task: readFlag(argv, "--task"),
    profile: readFlag(argv, "--profile"),
    model: readFlag(argv, "--model"),
  };
}

/** The ledger's next recommendation. A malformed ledger stops the loop. */
export function nextTaskFromLedger(stateMd: string): NextTask {
  const next = parseNextTask(stateMd);
  if (!next) {
    throw new Error(
      `${STATE_FILE} has no "Next task: **...**" recommendation — fix the ledger before looping.`,
    );
  }
  return next;
}

/**
 * One iteration: deliver and verify one task in a warm sandbox on its own
 * branch, then PR it and squash-merge. The branch is pushed either way — a
 * failed verification leaves it up for inspection with no PR.
 *
 * `runDeps` is `openRun`'s seam, passed through so a test can drive this whole
 * lifecycle against a fake sandbox. Defaulted, so `runTaskLoop` is unchanged.
 */
export async function runIteration(
  config: TaskConfig,
  run: ResolvedPhases,
  next: NextTask,
  runDeps?: RunDeps,
): Promise<{ prUrl: string }> {
  const { label, branch } = next;

  // `openRun` owns the resume (and its ordering against sandbox creation).
  await using opened = await openRun({ config, run, branch }, runDeps);

  // The verifier is a reviewer, so it gets the review phase's model — which is
  // how a mixed run ends up building with Codex and checking with Opus.
  const taskCtx = opened.ctx.task;
  const verifyCtx = opened.ctx.review;

  // `BRANCH` is injected by the phase from `ctx.branch`.
  const args = {
    TASK_LABEL: label,
    CONVENTIONS: renderConventions(config.toolchain, config.extraConventions),
    VERIFY: toolchains[config.toolchain].test,
  };

  let task = await runTaskPhase(taskCtx, {
    args,
    name: `task-${branch}`,
    template: TASK_TEMPLATE,
  });
  if (task.commits === 0) {
    console.log(`Task "${label}" made no commits; retrying once with a fresh context.`);
    task = await runTaskPhase(taskCtx, {
      args,
      name: `task-${branch}-retry`,
      template: TASK_TEMPLATE,
    });
  }
  if (task.commits === 0) {
    throw new Error(`Task "${label}" made no commits after a retry; stopping the loop.`);
  }

  const verify = await runVerifyPhase(verifyCtx, {
    args,
    name: `verify-${branch}`,
    template: VERIFY_TEMPLATE,
  });

  // Push either way: a failed verification leaves the branch up for inspection.
  await push(branch);

  if (!verify.passed) {
    throw new Error(
      `Verification of "${label}" did not pass (signal: ${verify.signal ?? "none"}). ` +
        `Branch ${branch} is pushed for inspection; no PR was opened.`,
    );
  }
  console.log(
    `Task "${label}": ${task.commits} commit(s), verify: ${verify.commits} fix commit(s).`,
  );

  // Release the managed worktree BEFORE delivering: it has `branch` checked
  // out, and git refuses to delete a branch a worktree holds. `close()` is
  // idempotent, so the `await using` disposal below is still a no-op safety net.
  const { preservedWorktreePath } = await opened.sandbox.close();
  if (preservedWorktreePath) {
    console.error(
      `Worktree preserved at ${preservedWorktreePath} (uncommitted changes); ` +
        `${branch} cannot be deleted until it is removed.`,
    );
  }

  return deliverPullRequest({
    branch,
    title: `Task ${label}`,
    body:
      `Automated sandcastle-agent run (${describeRun(run, ["task", "review"])}): ` +
      `delivered and verified "${label}" per PLAN.md/${STATE_FILE}.`,
    squashMerge: true,
  });
}

export type MainDeps = {
  /** `git pull --ff-only origin main`; false when main could not fast-forward. */
  syncMain: () => Promise<boolean>;
  /** Read the ledger's next recommended task. */
  nextTask: () => NextTask;
  runIteration: (run: ResolvedPhases, next: NextTask) => Promise<{ prUrl: string }>;
  log?: (message: string) => void;
};

/**
 * The loop: sync main, take the next task, deliver it, repeat. An explicit
 * `--task` pins only the FIRST iteration — the rest follow the ledger, which the
 * previous iteration's session just updated.
 */
export async function main(options: CliOptions, deps: MainDeps): Promise<string[]> {
  const log = deps.log ?? ((message: string) => console.log(message));
  const run = resolvePhases({ dispatchProfile: options.profile, modelOverride: options.model });
  const prUrls: string[] = [];

  for (let i = 1; i <= options.iterations; i++) {
    if (!(await deps.syncMain())) {
      throw new Error("git pull --ff-only origin main failed; resolve main before looping.");
    }

    const next =
      options.task && i === 1
        ? { label: options.task, branch: taskBranch(options.task) }
        : deps.nextTask();

    log(
      `\n=== Iteration ${i}/${options.iterations} [${describeRun(run, ["task", "review"])}]: ` +
        `"${next.label}" on ${next.branch} ===`,
    );
    const { prUrl } = await deps.runIteration(run, next);
    prUrls.push(prUrl);
    log(`Merged: ${prUrl}`);
  }

  return prUrls;
}

/**
 * The consumer entrypoint. A repo's `.sandcastle/config.mts` calls this behind
 * `isEntrypoint(import.meta.url)`, which keeps the consumer contract at one file.
 */
export function runTaskLoop(config: TaskConfig, argv?: string[]): Promise<string[]> {
  return main(parseCli(argv), {
    syncMain: () => syncMain(),
    nextTask: () => nextTaskFromLedger(readFileSync(STATE_FILE, "utf8")),
    runIteration: (run, next) => runIteration(config, run, next),
  });
}

export { isEntrypoint };
export { parseNextTask, taskBranch, taskSlug, type NextTask } from "./state.mts";
