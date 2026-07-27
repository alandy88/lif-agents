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
    exec(command: string): Promise<{
        readonly stdout: string;
        readonly exitCode: number;
    }>;
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
 * The one place a prompt reaches an agent. Defanging here rather than at each
 * call site is what makes it part of the practice layer: a phase cannot forget
 * it, and a template that gains a shell expression later cannot reopen the hole.
 */
export declare function runPhaseSession(ctx: PhaseContext, input: PhaseInput, defaults: {
    template: string;
    maxIterations: number;
}, completionSignal?: string[]): Promise<PhaseRunResult>;
//# sourceMappingURL=context.d.mts.map