// Opening a run: the scaffold both presets need before their first phase.
//
// `runIssue` and `runIteration` are different lifecycles, but they began the
// same way — resume the branch from origin, assemble preflight, create the
// sandbox, build one PhaseContext per phase — and that opening was duplicated
// line for line in both. Duplicated *order*, specifically: three of the four
// steps are only correct in relation to each other (resume before the sandbox,
// toolchain before credentials), and an ordering rule copied into two files is
// one that can silently hold in one of them and not the other. Extracting it
// gives the rules a single home, and `run.test.mts` a single thing to pin.
//
// What is NOT here: anything after the sandbox is warm. The presets diverge
// completely from their first phase call onward, and pulling that apart would
// mean inventing a lifecycle engine — which the phase layer exists to avoid.
import { createSandbox } from "@ai-hero/sandcastle";
import { resumeFromOrigin } from "./branch.mjs";
import { hostGit } from "./host-exec.mjs";
import { createAgent, createSandboxProvider, providerPreflight } from "./provider-setup.mjs";
import { templatePath } from "./templates.mjs";
import { toolchains } from "./toolchains.mjs";
const hostDeps = {
    // The one place the kit speaks sandcastle's dialect of "warm a sandbox":
    // the provider and the hooks spelling live here, not in the seam.
    createSandbox: ({ branch, preflight }) => createSandbox({
        branch,
        sandbox: createSandboxProvider(),
        hooks: {
            sandbox: {
                onSandboxReady: preflight.map((command) => ({ command })),
            },
        },
    }),
    createAgent,
    git: hostGit,
};
/**
 * Resume the branch, warm a sandbox on it, and hand back one phase context per
 * phase. Everything a lifecycle needs before its first phase call, and nothing
 * after it.
 */
export async function openRun(input, deps = hostDeps) {
    const { config, run, branch } = input;
    // Resume: when a prior run pushed this branch, recreate it locally from
    // origin so the sandbox continues it (and its trailers) instead of starting
    // a fresh branch that could never fast-forward-push. `branch.mts` owns HOW;
    // what is this module's is WHEN — it MUST precede `createSandbox`, because
    // the sandbox checks the branch out into its worktree and a force after that
    // point moves a ref the run is already standing on.
    await resumeFromOrigin(branch, deps.git);
    // Toolchain warm-up, then repo extras, then provider auth — the donor's
    // order, and the one that fails on a missing toolchain before it fails on a
    // missing credential.
    const preflight = [
        ...toolchains[config.toolchain].preflight,
        ...(config.preflight?.() ?? []),
        ...providerPreflight(Object.values(run.phases)),
    ];
    const sandbox = await deps.createSandbox({ branch, preflight });
    // One context per phase: the sandbox, branch and template resolver are shared;
    // only the agent differs, which is where per-phase model routing lands.
    //
    // All three are built even for a lifecycle that runs two. An unused context
    // costs nothing: `claudeCode` and `codex` are pure object-literal factories, so
    // no session, process or credential is touched until a phase actually runs one.
    const prompt = (name) => templatePath(name, { overrideDir: config.templateDir });
    const shared = { sandbox, branch, prompt };
    const ctx = {
        plan: { ...shared, agent: deps.createAgent(run.phases.plan) },
        task: { ...shared, agent: deps.createAgent(run.phases.task) },
        review: { ...shared, agent: deps.createAgent(run.phases.review) },
    };
    return {
        sandbox,
        ctx,
        [Symbol.asyncDispose]: () => sandbox[Symbol.asyncDispose](),
    };
}
//# sourceMappingURL=run.mjs.map