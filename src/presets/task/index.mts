// The ledger lifecycle, ported from Morrow's `.sandcastle/workflows/task/main.mts`:
//
//   STATE.md's next task → task session (retried once) → fresh-context verify →
//   push → PR → squash-merge to main → repeat.
//
// No issue source and no checklist: PLAN.md is the plan and STATE.md is the
// ledger. The stages are the same `../../phases/` functions `presets/implement`
// composes — the task phase having two consumers is what earns the phase layer.

import { readFileSync } from "node:fs";
import { createSandbox } from "@ai-hero/sandcastle";
import { hostGit } from "../../lib/host-exec.mts";
import { assertKnownFlags, readFlag } from "../../lib/cli.mts";
import { describeRun, resolvePhases, type ResolvedPhases } from "../../lib/profiles.mts";
import { templatePath } from "../../lib/templates.mts";
import { isEntrypoint } from "../../lib/entrypoint.mts";
import { createAgent, createSandboxProvider, providerPreflight } from "../../lib/provider-setup.mts";
import { renderConventions, toolchains, type Toolchain } from "../../lib/toolchains.mts";
import type { PhaseContext } from "../../phases/context.mts";
import { runTaskPhase } from "../../phases/task.mts";
import { runVerifyPhase } from "../../phases/verify.mts";
import { runDeliverPhase } from "../../phases/deliver.mts";
import { parseNextTask, taskBranch, type NextTask } from "./state.mts";

/** The ledger preset's prompts; `templateDir` overrides them by the same path. */
const TASK_TEMPLATE = "task/task-prompt.md";
const VERIFY_TEMPLATE = "task/verify-prompt.md";

/** The ledger file the loop reads its next task from. */
export const STATE_FILE = "STATE.md";

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
 */
export async function runIteration(
  config: TaskConfig,
  run: ResolvedPhases,
  next: NextTask,
): Promise<{ prUrl: string }> {
  const { label, branch } = next;
  const prompt = (name: string) => templatePath(name, { overrideDir: config.templateDir });

  // Resume: when a prior (failed) run pushed this branch, recreate it locally
  // from origin so the sandbox continues it instead of starting over.
  const originBranch = await hostGit(["rev-parse", "--verify", "--quiet", `origin/${branch}`]);
  if (originBranch.exitCode === 0) {
    await hostGit(["branch", "--force", branch, `origin/${branch}`]);
  }

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

  // The verifier is a reviewer, so it gets the review phase's model — which is
  // how a mixed run ends up building with Codex and checking with Opus.
  const shared = { sandbox, branch, prompt };
  const taskCtx: PhaseContext = { ...shared, agent: createAgent(run.phases.task) };
  const verifyCtx: PhaseContext = { ...shared, agent: createAgent(run.phases.review) };

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
  const push = await hostGit(["push", "-u", "origin", branch]);
  if (push.exitCode !== 0) {
    throw new Error(`git push origin ${branch} exited ${push.exitCode}`);
  }

  if (!verify.passed) {
    throw new Error(
      `Verification of "${label}" did not pass (signal: ${verify.signal ?? "none"}). ` +
        `Branch ${branch} is pushed for inspection; no PR was opened.`,
    );
  }
  console.log(
    `Task "${label}": ${task.commits} commit(s), verify: ${verify.commits} fix commit(s).`,
  );

  return runDeliverPhase({
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
    syncMain: async () =>
      (await hostGit(["pull", "--ff-only", "origin", "main"])).exitCode === 0,
    nextTask: () => nextTaskFromLedger(readFileSync(STATE_FILE, "utf8")),
    runIteration: (run, next) => runIteration(config, run, next),
  });
}

export { isEntrypoint };
export { parseNextTask, taskBranch, taskSlug, type NextTask } from "./state.mts";
