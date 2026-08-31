// The ledger lifecycle, ported from Morrow's `.sandcastle/workflows/task/main.mts`:
//
//   STATE.md's next task → task session (retried once) → fresh-context verify →
//   push → PR → squash-merge to main → repeat.
//
// No issue source and no checklist: PLAN.md is the plan and STATE.md is the
// ledger. The stages are the same `../../phases/` functions `presets/implement`
// composes — the task phase having two consumers is what earns the phase layer.
var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import { readFileSync } from "node:fs";
import { push, syncMain } from "../../lib/branch.mjs";
import { assertKnownFlags, readFlag } from "../../lib/cli.mjs";
import { describeRun, resolvePhases } from "../../lib/profiles.mjs";
import { isEntrypoint } from "../../lib/entrypoint.mjs";
import { openRun } from "../../lib/run.mjs";
import { renderConventions, toolchains } from "../../lib/toolchains.mjs";
import { runTaskPhase } from "../../phases/task.mjs";
import { runVerifyPhase } from "../../phases/verify.mjs";
import { deliverPullRequest } from "../../lib/github-pr.mjs";
import { parseNextTask, taskBranch } from "./state.mjs";
/** The ledger preset's prompts; `templateDir` overrides them by the same path. */
const TASK_TEMPLATE = "task/task-prompt.md";
const VERIFY_TEMPLATE = "task/verify-prompt.md";
/** The ledger file the loop reads its next task from. */
export const STATE_FILE = "STATE.md";
export function parseCli(argv = process.argv.slice(2)) {
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
export function nextTaskFromLedger(stateMd) {
    const next = parseNextTask(stateMd);
    if (!next) {
        throw new Error(`${STATE_FILE} has no "Next task: **...**" recommendation — fix the ledger before looping.`);
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
export async function runIteration(config, run, next, runDeps) {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const { label, branch } = next;
        // `openRun` owns the resume (and its ordering against sandbox creation).
        const opened = __addDisposableResource(env_1, await openRun({ config, run, branch }, runDeps), true);
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
            throw new Error(`Verification of "${label}" did not pass (signal: ${verify.signal ?? "none"}). ` +
                `Branch ${branch} is pushed for inspection; no PR was opened.`);
        }
        console.log(`Task "${label}": ${task.commits} commit(s), verify: ${verify.commits} fix commit(s).`);
        // Release the managed worktree BEFORE delivering: it has `branch` checked
        // out, and git refuses to delete a branch a worktree holds. `close()` is
        // idempotent, so the `await using` disposal below is still a no-op safety net.
        const { preservedWorktreePath } = await opened.sandbox.close();
        if (preservedWorktreePath) {
            console.error(`Worktree preserved at ${preservedWorktreePath} (uncommitted changes); ` +
                `${branch} cannot be deleted until it is removed.`);
        }
        return deliverPullRequest({
            branch,
            title: `Task ${label}`,
            body: `Automated sandcastle-agent run (${describeRun(run, ["task", "review"])}): ` +
                `delivered and verified "${label}" per PLAN.md/${STATE_FILE}.`,
            squashMerge: true,
        });
    }
    catch (e_1) {
        env_1.error = e_1;
        env_1.hasError = true;
    }
    finally {
        const result_1 = __disposeResources(env_1);
        if (result_1)
            await result_1;
    }
}
/**
 * The loop: sync main, take the next task, deliver it, repeat. An explicit
 * `--task` pins only the FIRST iteration — the rest follow the ledger, which the
 * previous iteration's session just updated.
 */
export async function main(options, deps) {
    const log = deps.log ?? ((message) => console.log(message));
    const run = resolvePhases({ dispatchProfile: options.profile, modelOverride: options.model });
    const prUrls = [];
    for (let i = 1; i <= options.iterations; i++) {
        if (!(await deps.syncMain())) {
            throw new Error("git pull --ff-only origin main failed; resolve main before looping.");
        }
        const next = options.task && i === 1
            ? { label: options.task, branch: taskBranch(options.task) }
            : deps.nextTask();
        log(`\n=== Iteration ${i}/${options.iterations} [${describeRun(run, ["task", "review"])}]: ` +
            `"${next.label}" on ${next.branch} ===`);
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
export function runTaskLoop(config, argv) {
    return main(parseCli(argv), {
        syncMain: () => syncMain(),
        nextTask: () => nextTaskFromLedger(readFileSync(STATE_FILE, "utf8")),
        runIteration: (run, next) => runIteration(config, run, next),
    });
}
export { isEntrypoint };
export { parseNextTask, taskBranch, taskSlug } from "./state.mjs";
//# sourceMappingURL=index.mjs.map