import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePhases, type ModelProfile } from "./profiles.mts";
import { providerPreflight } from "./provider-setup.mts";
import { toolchains } from "./toolchains.mts";
import {
  openRun,
  type RepoConfig,
  type RunDeps,
  type RunSandbox,
  type RunSandboxOptions,
} from "./run.mts";

// `openRun` is four steps whose only content is the order they happen in, and
// each of them fails SILENTLY when it slips:
//
//   • resume after the sandbox is created still opens a run — one that can
//     never fast-forward-push, hours later, at the terminal push;
//   • preflight out of order surfaces a missing toolchain as a confusing
//     credential error;
//   • a context built from the wrong phase's agent runs the review model on the
//     task, and produces a plausible-looking run.
//
// None of that shows up in a typecheck, so these tests are the only thing holding
// the order in place.

const CONFIG: RepoConfig = { toolchain: "node", preflight: () => ["make docs"] };

/** Fakes for all three deps, recording call order across `git` and the sandbox. */
function harness(options: { revParseExit?: number } = {}) {
  /** Interleaved log — the only way to assert resume PRECEDES creation. */
  const calls: string[] = [];
  const sandboxOptions: RunSandboxOptions[] = [];
  const agentProfiles: ModelProfile[] = [];
  const agents: unknown[] = [];

  const sandbox: RunSandbox = {
    run: async () => ({ commits: [] }),
    exec: async () => ({ stdout: "", exitCode: 0 }),
    close: async () => ({}),
    [Symbol.asyncDispose]: async () => {},
  };

  const deps: RunDeps = {
    createSandbox: async (created) => {
      calls.push("createSandbox");
      sandboxOptions.push(created);
      return sandbox;
    },
    // A fresh object per call, so "one agent per phase" is testable by identity.
    createAgent: (profile) => {
      agentProfiles.push(profile);
      const agent = { agentFor: profile };
      agents.push(agent);
      return agent;
    },
    git: async (args) => {
      calls.push(`git ${args.join(" ")}`);
      return {
        stdout: "",
        stderr: "",
        exitCode: args[0] === "rev-parse" ? (options.revParseExit ?? 0) : 0,
      };
    },
  };

  const preflight = () =>
    (sandboxOptions[0]!.hooks?.sandbox?.onSandboxReady ?? []).map((hook) => hook.command);

  return { deps, calls, sandbox, preflight, agentProfiles, agents };
}

test("the branch is recreated from origin before the sandbox is created", async () => {
  const resumed = harness({ revParseExit: 0 });
  await using opened = await openRun(
    { config: CONFIG, run: resolvePhases(), branch: "agent/issue-7" },
    resumed.deps,
  );
  assert.ok(opened.sandbox);

  const force = resumed.calls.indexOf("git branch --force agent/issue-7 origin/agent/issue-7");
  assert.notEqual(force, -1, "an existing origin branch must be forced onto the local one");
  assert.ok(
    force < resumed.calls.indexOf("createSandbox"),
    `the force must precede sandbox creation, got ${resumed.calls.join(" | ")}`,
  );

  // No origin branch: nothing to resume, and the run still opens on a new one.
  const fresh = harness({ revParseExit: 1 });
  await using first = await openRun(
    { config: CONFIG, run: resolvePhases(), branch: "agent/issue-7" },
    fresh.deps,
  );
  assert.ok(first.sandbox);
  assert.ok(!fresh.calls.some((call) => call.startsWith("git branch --force")));
  assert.ok(fresh.calls.includes("createSandbox"));
});

test("preflight runs the toolchain, then the repo's extras, then provider auth", async () => {
  const { deps, preflight } = harness();
  const run = resolvePhases();
  await using opened = await openRun(
    { config: CONFIG, run, branch: "agent/issue-7" },
    deps,
  );
  assert.ok(opened.sandbox);

  const commands = preflight();
  const toolchain = toolchains.node.preflight;
  assert.deepEqual(commands.slice(0, toolchain.length), [...toolchain]);
  assert.deepEqual(commands.slice(toolchain.length, toolchain.length + 1), ["make docs"]);
  assert.deepEqual(
    commands.slice(toolchain.length + 1),
    providerPreflight([run.phases.plan, run.phases.task, run.phases.review]),
  );
});

test("each phase gets its own agent and shares everything else", async () => {
  const { deps, sandbox, agentProfiles, agents } = harness();
  const run = resolvePhases();
  await using opened = await openRun(
    { config: CONFIG, run, branch: "agent/issue-7" },
    deps,
  );
  const { ctx } = opened;

  // Built for all three phases even when a lifecycle runs only two.
  assert.deepEqual(agentProfiles, [run.phases.plan, run.phases.task, run.phases.review]);
  for (const [index, phase] of (["plan", "task", "review"] as const).entries()) {
    // Identity, not shape: plan and review resolve to the same model on the
    // mixed map, so a structural check would pass on a reused handle.
    assert.equal(ctx[phase].agent, agents[index], phase);
    assert.equal(ctx[phase].sandbox, sandbox, phase);
    assert.equal(ctx[phase].branch, "agent/issue-7", phase);
    assert.equal(ctx[phase].prompt, ctx.plan.prompt, phase);
  }
  assert.notEqual(ctx.plan.agent, ctx.review.agent, "distinct agents, not one reused handle");
});
