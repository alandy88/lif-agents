import { type GitRunner } from "./branch.mts";
import type { ModelProfile, Phase, ResolvedPhases } from "./profiles.mts";
import { type Toolchain } from "./toolchains.mts";
import type { PhaseAgent, PhaseContext, PhaseSandbox } from "../phases/context.mts";
/**
 * The per-repo half of the pipeline — and only that half. Everything keyed off
 * `profile.provider` (agent construction, credential materialization, the CLI
 * smoke check) is the kit's, because a consumer writing it would be copying the
 * same block into every repo. What is left here cannot be written without
 * naming this repo's package manager or test command, which is exactly the
 * PRD's module-boundary test.
 *
 * Both presets alias this: the escape hatches are the same because the reason
 * for them is.
 */
export interface RepoConfig {
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
/**
 * `PhaseSandbox` plus the teardown a run owns. Structural for the same reason
 * `PhaseSandbox` is: sandcastle's `Sandbox` satisfies it without being named,
 * so nothing here drags the kit's dependency into a consumer's typecheck and a
 * test can hand `openRun` a four-property object literal.
 */
export interface RunSandbox extends PhaseSandbox {
    close(): Promise<{
        preservedWorktreePath?: string;
    }>;
    [Symbol.asyncDispose](): Promise<void>;
}
/**
 * What `openRun` asks of a sandbox, in the kit's own vocabulary: a branch to
 * check out and the commands to run once the sandbox is warm. How sandcastle
 * spells that (its provider argument, its `hooks` nesting) is the host
 * adapter's business below — keeping it out of this interface is what keeps a
 * sandcastle API change contained to one function, and lets a test fake take
 * a shape it would actually read.
 */
export interface RunSandboxOptions {
    readonly branch: string;
    readonly preflight: readonly string[];
}
/**
 * The injectable half, following `DeliverDeps`: real implementations by
 * default, overridable so the tests can drive the ordering rules without a
 * container.
 */
export interface RunDeps {
    createSandbox: (options: RunSandboxOptions) => Promise<RunSandbox>;
    createAgent: (profile: ModelProfile) => PhaseAgent;
    /** Host git, handed to `resumeFromOrigin` — `branch.mts`'s own seam, reused. */
    git: GitRunner;
}
export interface RunInput {
    config: RepoConfig;
    run: ResolvedPhases;
    branch: string;
}
/**
 * The opened run. The HANDLE is disposable, not just the sandbox it carries:
 * `await using` cannot destructure, so a caller that wanted
 * `await using { sandbox, ctx } = ...` would have to keep the handle anyway.
 * Disposal delegates, and `close()` is idempotent, so a preset that closes the
 * sandbox early (the ledger loop does, before deleting the branch) still gets a
 * safety net rather than a double teardown.
 */
export interface RunHandle {
    sandbox: RunSandbox;
    ctx: Record<Phase, PhaseContext>;
    [Symbol.asyncDispose](): Promise<void>;
}
/**
 * Resume the branch, warm a sandbox on it, and hand back one phase context per
 * phase. Everything a lifecycle needs before its first phase call, and nothing
 * after it.
 */
export declare function openRun(input: RunInput, deps?: RunDeps): Promise<RunHandle>;
//# sourceMappingURL=run.d.mts.map