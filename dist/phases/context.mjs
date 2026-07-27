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
import { defangPromptArgs } from "../lib/defang.mjs";
/**
 * The one place a prompt reaches an agent. Defanging here rather than at each
 * call site is what makes it part of the practice layer: a phase cannot forget
 * it, and a template that gains a shell expression later cannot reopen the hole.
 */
export async function runPhaseSession(ctx, input, defaults, completionSignal) {
    return ctx.sandbox.run({
        agent: ctx.agent,
        promptFile: ctx.prompt(input.template ?? defaults.template),
        promptArgs: defangPromptArgs({ BRANCH: ctx.branch, ...input.args }),
        maxIterations: input.maxIterations ?? defaults.maxIterations,
        name: input.name,
        completionSignal,
    });
}
//# sourceMappingURL=context.mjs.map