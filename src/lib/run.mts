// The run scaffold both presets share: resume the branch from origin, assemble
// the preflight, open one warm sandbox, and hand out a `PhaseContext` per
// routing phase.
//
// Extracted because implement.mts and task/index.mts assembled the identical
// ~35 lines, and because `createSandbox` called inline made the two lifecycle
// functions untestable — a preset can now be driven with a fake `RunSession`.
//
// `RunSession` is declared STRUCTURALLY, like `PhaseContext`: sandcastle's
// `Sandbox`, `SandboxProvider` and `AgentProvider` stay inside this module body
// so no `@ai-hero` type reaches the emitted declaration (the boundary test
// asserts it for `lib/run.d.mts`).

import { createSandbox } from "@ai-hero/sandcastle";
import { hostGit } from "./host-exec.mts";
import { createAgent, createSandboxProvider, providerPreflight } from "./provider-setup.mts";
import { templatePath } from "./templates.mts";
import { toolchains } from "./toolchains.mts";
import type { Phase, ResolvedPhases } from "./profiles.mts";
import type { RepoConfig } from "./repo-config.mts";
import type { PhaseContext } from "../phases/context.mts";

/**
 * Toolchain warm-up, then repo extras, then provider auth. Pure.
 *
 * This order is load-bearing: it fails on a missing toolchain before it fails
 * on a missing credential, which is the difference between a legible warm-up
 * error and an auth error that sends you looking at the wrong thing.
 */
export function assemblePreflight(config: RepoConfig, run: ResolvedPhases): string[] {
  return [
    ...toolchains[config.toolchain].preflight,
    ...(config.preflight?.() ?? []),
    ...providerPreflight(Object.values(run.phases)),
  ];
}

/** One run's warm sandbox, plus the per-phase contexts built on top of it. */
export interface RunSession {
  /** The PhaseContext for one routing phase. Agent built on first ask (lazy, memoized). */
  ctx(phase: Phase): PhaseContext;
  exec(command: string): Promise<{ readonly stdout: string; readonly exitCode: number }>;
  /** Explicit teardown; idempotent. Returns sandcastle's close result. */
  close(): Promise<{ preservedWorktreePath?: string }>;
  [Symbol.asyncDispose](): Promise<void>;
}

/**
 * Open a run: resume the branch from origin when a prior run pushed it, warm a
 * sandbox on it with the assembled preflight, and expose one context per phase.
 */
export async function openRun(cfg: {
  config: RepoConfig;
  run: ResolvedPhases;
  branch: string;
}): Promise<RunSession> {
  const { config, run, branch } = cfg;

  // Resume: when a prior run pushed this branch, recreate it locally from
  // origin so the sandbox continues it (and its trailers) instead of starting a
  // fresh branch that could never fast-forward-push.
  const originBranch = await hostGit(["rev-parse", "--verify", "--quiet", `origin/${branch}`]);
  if (originBranch.exitCode === 0) {
    await hostGit(["branch", "--force", branch, `origin/${branch}`]);
  }

  const sandbox = await createSandbox({
    branch,
    sandbox: createSandboxProvider(),
    hooks: {
      sandbox: {
        onSandboxReady: assemblePreflight(config, run).map((command) => ({ command })),
      },
    },
  });

  // One context per phase: the sandbox, branch and template resolver are shared;
  // only the agent differs, which is where per-phase model routing lands.
  const shared = {
    sandbox,
    branch,
    prompt: (name: string) => templatePath(name, { overrideDir: config.templateDir }),
  };
  const contexts = new Map<Phase, PhaseContext>();
  // Memoized rather than re-issued: a preset closes early to release the
  // worktree holding the branch, and the `await using` disposal that follows
  // must be a no-op.
  let closing: Promise<{ preservedWorktreePath?: string }> | undefined;
  const close = () => (closing ??= sandbox.close());

  return {
    ctx(phase) {
      let context = contexts.get(phase);
      if (!context) {
        context = { ...shared, agent: createAgent(run.phases[phase]) };
        contexts.set(phase, context);
      }
      return context;
    },
    exec: (command) => sandbox.exec(command),
    close,
    async [Symbol.asyncDispose]() {
      await close();
    },
  };
}
