import { test } from "node:test";
import assert from "node:assert/strict";
import type { PhaseContext, PhaseRunOptions, PhaseRunResult, PhaseSandbox } from "./context.mts";
import { PLAN_TEMPLATE, runPlanPhase } from "./plan.mts";
import { TASK_TEMPLATE, runTaskPhase } from "./task.mts";
import { runReviewPhase } from "./review.mts";
import { VERIFY_COMPLETE, VERIFY_FAILED, runVerifyPhase } from "./verify.mts";
import { runDeliverPhase, type DeliverDeps } from "./deliver.mts";

/** A sandbox that records what it was asked to do; the phases' only effect. */
function fakeContext(
  result: Partial<PhaseRunResult> = {},
  exec: (command: string) => { stdout: string; exitCode: number } = () => ({
    stdout: "",
    exitCode: 0,
  }),
) {
  const runs: PhaseRunOptions[] = [];
  const execs: string[] = [];
  const sandbox: PhaseSandbox = {
    run: async (options) => {
      runs.push(options);
      return { commits: [], ...result };
    },
    exec: async (command) => {
      execs.push(command);
      return exec(command);
    },
  };
  const ctx: PhaseContext = {
    sandbox,
    branch: "agent/issue-7",
    agent: { id: "fake-agent" },
    prompt: (name) => `templates/${name}`,
  };
  return { ctx, runs, execs };
}

test("a phase injects BRANCH from the context and defangs every argument", async () => {
  const { ctx, runs } = fakeContext();
  await runTaskPhase(ctx, { args: { TASK_TEXT: "run !`whoami` first" }, name: "task-7-1" });

  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0]!.promptArgs, {
    BRANCH: "agent/issue-7",
    TASK_TEXT: "run ! `whoami` first",
  });
  assert.equal(runs[0]!.name, "task-7-1");
  assert.equal(runs[0]!.agent, ctx.agent);
});

test("each phase resolves its default template, and an input overrides it", async () => {
  const { ctx, runs } = fakeContext();
  await runPlanPhase(ctx, { args: {}, name: "plan-7" });
  await runTaskPhase(ctx, { args: {}, name: "task-7-1" });
  await runTaskPhase(ctx, { args: {}, name: "task-x", template: "task/task-prompt.md" });

  assert.equal(runs[0]!.promptFile, `templates/${PLAN_TEMPLATE}`);
  assert.equal(runs[1]!.promptFile, `templates/${TASK_TEMPLATE}`);
  assert.equal(runs[2]!.promptFile, "templates/task/task-prompt.md");
});

test("the task phase reports commit count and never retries itself", async () => {
  const empty = fakeContext({ commits: [] });
  assert.deepEqual(await runTaskPhase(empty.ctx, { args: {}, name: "t" }), { commits: 0 });
  assert.equal(empty.runs.length, 1);

  const landed = fakeContext({ commits: [{ sha: "a" }, { sha: "b" }] });
  assert.deepEqual(await runTaskPhase(landed.ctx, { args: {}, name: "t" }), { commits: 2 });
});

test("the review phase harvests its summary artifact", async () => {
  const { ctx, execs } = fakeContext({ commits: [{ sha: "a" }] }, () => ({
    stdout: "### What changed\n",
    exitCode: 0,
  }));
  const review = await runReviewPhase(ctx, {
    args: {},
    name: "review-7",
    summaryFile: "AGENT_SUMMARY.md",
  });

  assert.deepEqual(review, { commits: 1, summary: "### What changed\n" });
  assert.ok(execs.some((command) => command.includes("AGENT_SUMMARY.md")));
});

test("the review phase reads nothing when no summary file is asked for", async () => {
  const { ctx, execs } = fakeContext({ commits: [] });
  assert.deepEqual(await runReviewPhase(ctx, { args: {}, name: "review-7" }), {
    commits: 0,
    summary: "",
  });
  assert.deepEqual(execs, []);
});

/** Deliver's host commands, recorded; `gh`/`git` exit 0 unless told otherwise. */
function fakeDeliverDeps(
  options: { state?: string; mergeExit?: number; gitExit?: number } = {},
) {
  const gh: string[][] = [];
  const git: string[][] = [];
  const deps: DeliverDeps = {
    gh: async (args) => {
      gh.push(args);
      if (args[1] === "merge") {
        return { stdout: "", stderr: "", exitCode: options.mergeExit ?? 0 };
      }
      if (args[1] === "view") {
        return { stdout: `${options.state ?? "MERGED"}\n`, stderr: "", exitCode: 0 };
      }
      return { stdout: "https://example.test/pr/1\n", stderr: "", exitCode: 0 };
    },
    ghJson: async () => "https://example.test/pr/1\n",
    git: async (args) => {
      git.push(args);
      return { stdout: "", stderr: "", exitCode: options.gitExit ?? 0 };
    },
  };
  return { deps, gh, git };
}

const DELIVERY = { branch: "agent/2-6-turns", title: "Task 2.6", body: "body" };

test("delivery without squash-merge leaves the PR open and touches no branch", async () => {
  const { deps, gh, git } = fakeDeliverDeps();
  const result = await runDeliverPhase(DELIVERY, deps);

  assert.deepEqual(result, { prUrl: "https://example.test/pr/1", created: true });
  assert.deepEqual(gh.map((args) => args[1]), ["create"]);
  assert.deepEqual(git, []);
});

test("the squash-merge path never passes --delete-branch and cleans up explicitly", async () => {
  const { deps, gh, git } = fakeDeliverDeps();
  await runDeliverPhase({ ...DELIVERY, squashMerge: true }, deps);

  const merge = gh.find((args) => args[1] === "merge")!;
  assert.ok(!merge.includes("--delete-branch"));
  assert.deepEqual(git, [
    ["branch", "-D", DELIVERY.branch],
    ["push", "origin", "--delete", DELIVERY.branch],
  ]);
});

test("a merged PR survives a non-zero merge exit and a failed cleanup", async () => {
  // The bug this phase exists to not repeat: a worktree holding the branch made
  // `gh` exit 1 after the merge had landed, and the loop aborted on a success.
  const { deps, git } = fakeDeliverDeps({ mergeExit: 1, gitExit: 1, state: "MERGED" });
  const result = await runDeliverPhase({ ...DELIVERY, squashMerge: true }, deps);

  assert.equal(result.prUrl, "https://example.test/pr/1");
  assert.equal(git.length, 2, "cleanup keeps going after the local delete fails");
});

test("delivery throws when the PR did not actually merge", async () => {
  const { deps, git } = fakeDeliverDeps({ mergeExit: 1, state: "OPEN" });
  await assert.rejects(
    runDeliverPhase({ ...DELIVERY, squashMerge: true }, deps),
    /the PR is OPEN; merge it manually/,
  );
  assert.deepEqual(git, [], "nothing is deleted when the merge did not land");
});

test("verify passes only on the COMPLETE promise", async () => {
  for (const [signal, passed] of [
    [VERIFY_COMPLETE, true],
    [VERIFY_FAILED, false],
    [undefined, false],
  ] as const) {
    const { ctx, runs } = fakeContext({ commits: [], completionSignal: signal });
    const verify = await runVerifyPhase(ctx, { args: {}, name: "verify-x" });
    assert.equal(verify.passed, passed, `signal ${signal ?? "none"}`);
    assert.equal(verify.signal, signal);
    assert.deepEqual(runs[0]!.completionSignal, [VERIFY_COMPLETE, VERIFY_FAILED]);
  }
});
