// Layer 2 — the shared shape every phase runs through.
//
// A phase is deliberately boring: an async function taking this context plus
// phase-specific inputs, returning a typed result. There is no pipeline engine,
// no DAG format and no registry — a preset is plain TypeScript calling phase
// functions in order, and a Layer-4 consumer composing its own lifecycle writes
// exactly what a preset writes internally.
//
// The sandbox and agent are typed STRUCTURALLY rather than as
// `@ai-hero/sandcastle`'s `Sandbox`/`AgentProvider`. Phases are
// consumer-importable, so naming sandcastle here would drag the kit's own
// dependency into a consumer's typecheck — the exact leak the boundary exists to
// close (and the boundary test asserts it for `phases/` as well as `presets/`).
// The structural seam also lets a phase test inject a fake sandbox.

import { defangPromptArgs } from "../lib/defang.mts";

/**
 * An agent handle, as produced by the kit's `createAgent`. Opaque on purpose:
 * the concrete type is sandcastle's and a phase only ever passes it through.
 */
export type PhaseAgent = unknown;

/**
 * Mirrors sandcastle's `SandboxRunOptions` closely enough that a real `Sandbox`
 * satisfies `PhaseSandbox` structurally — hence the optional members, which are
 * optional there too. Phases always pass `promptFile`, `promptArgs` and `name`.
 */
export interface PhaseRunOptions {
  readonly agent: PhaseAgent;
  readonly promptFile?: string;
  readonly promptArgs?: Record<string, string | number | boolean>;
  readonly maxIterations?: number;
  readonly name?: string;
  readonly completionSignal?: string | string[];
}

export interface PhaseRunResult {
  readonly commits: readonly unknown[];
  readonly completionSignal?: string;
}

/** The slice of the sandbox a phase uses. Satisfied by sandcastle's `Sandbox`. */
export interface PhaseSandbox {
  run(options: PhaseRunOptions): Promise<PhaseRunResult>;
  exec(command: string): Promise<{ readonly stdout: string; readonly exitCode: number }>;
}

export interface PhaseContext {
  /** The warm sandbox every phase of a run shares. */
  sandbox: PhaseSandbox;
  /** The branch the run is on; injected into every prompt as `{{BRANCH}}`. */
  branch: string;
  /** The agent for THIS phase — per-phase model routing lives in the preset. */
  agent: PhaseAgent;
  /** Template name (under `templates/`) → workspace-relative prompt path. */
  prompt: (name: string) => string;
}

/** Fields every phase input shares. */
export interface PhaseInput {
  /** Prompt arguments beyond `BRANCH`. Defanged by the phase, never the caller. */
  args: Record<string, string>;
  /** Sandcastle run name, e.g. `task-42-3`. */
  name: string;
  /** Template name overriding the phase's default, e.g. `task/task-prompt.md`. */
  template?: string;
  maxIterations?: number;
}

/**
 * Read a branch-local run artifact out of the sandbox. Absent and unreadable
 * both read as "" — a task session writes its artifact only when it has
 * something to say, so "no file" is the ordinary outcome of a clean run, not a
 * failure to surface (`|| true` keeps a missing file from failing the exec).
 */
export async function readSandboxFile(sandbox: PhaseSandbox, file: string): Promise<string> {
  const read = await sandbox.exec(`cat ${file} 2>/dev/null || true`);
  return read.exitCode === 0 ? read.stdout : "";
}

/**
 * The one place a prompt reaches an agent. Defanging here rather than at each
 * call site is what makes it part of the practice layer: a phase cannot forget
 * it, and a template that gains a shell expression later cannot reopen the hole.
 */
export async function runPhaseSession(
  ctx: PhaseContext,
  input: PhaseInput,
  defaults: { template: string; maxIterations: number },
  completionSignal?: string[],
): Promise<PhaseRunResult> {
  return ctx.sandbox.run({
    agent: ctx.agent,
    promptFile: ctx.prompt(input.template ?? defaults.template),
    promptArgs: defangPromptArgs({ BRANCH: ctx.branch, ...input.args }),
    maxIterations: input.maxIterations ?? defaults.maxIterations,
    name: input.name,
    completionSignal,
  });
}
