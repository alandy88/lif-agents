import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Issue, type IssueBodySource } from "../lib/github-issue.mts";
import {
  main,
  NO_NOTES_PLACEHOLDER,
  parseCli,
  renderNotes,
  renderPrBody,
  runIssue,
  type MainDeps,
} from "./implement.mts";
import { MIXED_PROFILE_NAME, resolvePhases } from "../lib/profiles.mts";
import type { RunSession } from "../lib/run.mts";
import type { PhaseRunOptions, PhaseSandbox } from "../phases/context.mts";

function makeDeps(overrides: {
  issue?: Partial<Issue>;
  isEpic?: boolean;
}): MainDeps & { comments: string[]; ran: boolean } {
  const issue: Issue = {
    title: "Fix the widget",
    body: "It is broken.",
    state: "OPEN",
    labels: ["ready-for-agent"],
    ...overrides.issue,
  };
  const state = {
    comments: [] as string[],
    ran: false,
  };
  return {
    comments: state.comments,
    get ran() {
      return state.ran;
    },
    issueSource: {
      getIssue: async () => issue,
      comment: async (_issueNumber, body) => {
        state.comments.push(body);
      },
      setBody: async () => {},
    },
    issueIsEpic: async () => overrides.isEpic ?? false,
    runIssue: async () => {
      state.ran = true;
      return { prUrl: "https://example.test/pr/1" };
    },
    env: {},
  };
}

test("parseCli requires a positive issue number", () => {
  assert.throws(() => parseCli([]), /--issue must be a positive/);
  assert.throws(() => parseCli(["--issue", "abc"]), /--issue must be a positive/);
  assert.throws(() => parseCli(["--issue", "42", "--verbose"]), /unknown flag --verbose/);
  assert.deepEqual(parseCli(["--issue", "42", "--profile", "claude", "--trigger", "issues"]), {
    issue: 42,
    profile: "claude",
    model: undefined,
    trigger: "issues",
  });
});

test("closed issues are rejected with an issue comment", async () => {
  const deps = makeDeps({ issue: { state: "CLOSED" } });
  await assert.rejects(main({ issue: 7 }, deps), /is closed/);
  assert.equal(deps.comments.length, 1);
  assert.match(deps.comments[0]!, /closed/);
  assert.equal(deps.ran, false);
});

test("label removed while queued skips cleanly on label-triggered runs", async () => {
  const deps = makeDeps({ issue: { labels: [] } });
  const result = await main({ issue: 7, trigger: "issues" }, deps);
  assert.equal(result, "skipped");
  assert.equal(deps.ran, false);
});

test("missing label does not block workflow_dispatch runs", async () => {
  const deps = makeDeps({ issue: { labels: [] } });
  const result = await main({ issue: 7, trigger: "workflow_dispatch" }, deps);
  assert.equal(result, "ran");
  assert.equal(deps.ran, true);
});

test("epics are rejected with an issue comment", async () => {
  const deps = makeDeps({ isEpic: true });
  await assert.rejects(main({ issue: 7 }, deps), /sub-issues/);
  assert.equal(deps.comments.length, 1);
  assert.match(deps.comments[0]!, /epic/);
  assert.equal(deps.ran, false);
});

test("bad sandcastle-agent configuration is reported on the issue", async () => {
  const deps = makeDeps({ issue: { labels: ["ready-for-agent", "agent:mystery"] } });
  await assert.rejects(main({ issue: 7 }, deps), /Unknown agent label/);
  assert.equal(deps.comments.length, 1);
  assert.match(deps.comments[0]!, /sandcastle-agent configuration rejected/);
  assert.equal(deps.ran, false);
});

test("renderNotes states the empty case instead of leaving a blank block", () => {
  assert.equal(renderNotes(""), NO_NOTES_PLACEHOLDER);
  assert.equal(renderNotes("   \n\n  "), NO_NOTES_PLACEHOLDER);
  assert.equal(
    renderNotes("\n## Deviations\n\n- **Task 1: x** — chose y.\n\n"),
    "## Deviations\n\n- **Task 1: x** — chose y.",
  );
});

test("renderPrBody carries the review summary under the issue link", () => {
  const run = resolvePhases({ labels: ["agent:claude"] });
  const body = renderPrBody(7, run, "### What changed\n\nThe widget now closes.\n");
  assert.match(body, /^Closes #7\./);
  assert.match(body, /Automated sandcastle-agent run \(claude → /);
  assert.match(body, /### What changed\n\nThe widget now closes\.$/);
});

test("renderPrBody flags a missing summary rather than posting a bare one-liner", () => {
  const run = resolvePhases({});
  assert.equal(run.name, MIXED_PROFILE_NAME);
  const body = renderPrBody(7, run, "   ");
  assert.match(body, /left no AGENT_SUMMARY\.md/);
  assert.match(body, /has not been summarized/);
});

test("the happy path runs and reports the PR on the issue", async () => {
  const deps = makeDeps({});
  const result = await main({ issue: 7, trigger: "issues" }, deps);
  assert.equal(result, "ran");
  assert.equal(deps.ran, true);
  assert.equal(deps.comments.length, 1);
  assert.match(deps.comments[0]!, /https:\/\/example.test\/pr\/1/);
});

// The templates and the promptArgs maps in runIssue are two halves of one
// contract with no compiler between them: a `{{ARG}}` the preset never supplies
// reaches the agent as a literal `{{ARG}}`, which reads as a corrupted prompt
// rather than an error. Pin the per-phase arg sets against the shipped defaults.
const BASE_ARGS = ["ISSUE_NUMBER", "ISSUE_TITLE", "BRANCH", "CONVENTIONS"];
const SUPPLIED: Record<string, string[]> = {
  "plan-prompt.md": [...BASE_ARGS, "ISSUE_BODY"],
  "task-prompt.md": [
    ...BASE_ARGS,
    "ISSUE_BODY",
    "NOTES",
    "TASK_INDEX",
    "TASK_COUNT",
    "TASK_TEXT",
    "TASK_LIST",
  ],
  "review-prompt.md": [...BASE_ARGS, "ISSUE_BODY", "NOTES"],
};

for (const [file, supplied] of Object.entries(SUPPLIED)) {
  test(`every {{ARG}} in the default ${file} is supplied by the preset`, () => {
    const source = readFileSync(
      fileURLToPath(new URL(`../../templates/implement/${file}`, import.meta.url)),
      "utf8",
    );
    const used = new Set(
      [...source.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((match) => match[1]!),
    );
    const missing = [...used].filter((name) => !supplied.includes(name));
    assert.deepEqual(missing, [], `unsupplied placeholders in ${file}`);
  });
}

/**
 * A `RunSession` that records what runIssue asked of the sandbox. Every agent
 * session reports zero commits; `exec` answers from `replies` (first matching
 * substring wins) and otherwise reads empty, exit 0.
 */
function fakeSession(branch: string, replies: Record<string, string> = {}) {
  const runs: PhaseRunOptions[] = [];
  const execs: string[] = [];
  const sandbox: PhaseSandbox = {
    run: async (options) => {
      runs.push(options);
      return { commits: [] };
    },
    exec: async (command) => {
      execs.push(command);
      const hit = Object.entries(replies).find(([needle]) => command.includes(needle));
      return { stdout: hit?.[1] ?? "", exitCode: 0 };
    },
  };
  const session: RunSession = {
    ctx: (phase) => ({
      sandbox,
      branch,
      agent: { phase },
      prompt: (name) => `templates/${name}`,
    }),
    exec: (command) => sandbox.exec(command),
    close: async () => ({}),
    [Symbol.asyncDispose]: async () => {},
  };
  return { session, runs, execs };
}

function fakeIssueSource(issue: Issue, comments: string[]): IssueBodySource {
  return {
    getIssue: async () => issue,
    comment: async (_issueNumber, body) => {
      comments.push(body);
    },
    setBody: async () => {},
  };
}

const RUN = resolvePhases({ labels: ["agent:claude"] });
const CONFIG = { toolchain: "node" } as const;

// The most consequential branch in the preset, and the one the guard-level tests
// cannot reach: a task that makes no commits even after its retry must stop the
// run, say so on the issue, and open NO PR — completed work stays pushed on the
// branch for the next run to resume from.
test("a task stuck after its retry is reported on the issue and opens no PR", async () => {
  const issue: Issue = {
    title: "Fix the widget",
    body: "It is broken.\n\n## Tasks\n\n- [ ] narrow the leak\n- [ ] add a regression test\n",
    state: "OPEN",
    labels: [],
  };
  const comments: string[] = [];
  const { session, runs } = fakeSession("agent/issue-9001");

  await assert.rejects(
    runIssue(CONFIG, RUN, 9001, issue, fakeIssueSource(issue, comments), async () => session),
    /made no commits after a retry/,
  );

  assert.equal(comments.length, 1);
  assert.match(comments[0]!, /^Task 1\/2 \("narrow the leak"\) made no commits after a retry\./);
  assert.match(comments[0]!, /Completed this run: 0; remaining unbuilt: 1/);
  assert.match(comments[0]!, /pushed on `agent\/issue-9001`/);
  // The task attempt plus its retry, and nothing else: no review session runs
  // past a stuck task, so no summary and no PR body can be produced.
  assert.equal(runs.length, 2);
  assert.deepEqual(
    runs.map((options) => options.name),
    ["task-9001-1", "task-9001-1-retry"],
  );
});

// The artifact strip is deliberately the host's job rather than an instruction
// the review session has to remember — a forgetful reviewer must not be able to
// leak scratch files onto main. Nothing asserted it.
test("run artifacts are git rm'd and committed before the PR", async () => {
  const issue: Issue = {
    title: "Fix the widget",
    body: "## Tasks\n\n- [x] narrow the leak\n",
    state: "OPEN",
    labels: [],
  };
  const { session, execs } = fakeSession("agent/issue-9002", {
    "git ls-files": "AGENT_NOTES.md\nAGENT_SUMMARY.md\n",
  });

  // Run from a non-repo cwd so the host `git push` that follows the strip fails
  // deterministically (and reaches no network): the strip is what we assert, and
  // the rejection proves delivery was never attempted.
  const cwd = process.cwd();
  process.chdir(mkdtempSync(join(tmpdir(), "sandcastle-kit-")));
  try {
    await assert.rejects(
      runIssue(CONFIG, RUN, 9002, issue, fakeIssueSource(issue, []), async () => session),
      /git push origin agent\/issue-9002 exited/,
    );
  } finally {
    process.chdir(cwd);
  }

  const strip = execs.find((command) => command.includes("git rm"))!;
  assert.ok(strip, "the host never issued the artifact strip");
  assert.match(strip, /git rm -q -f --ignore-unmatch AGENT_NOTES\.md AGENT_SUMMARY\.md/);
  assert.match(strip, /commit -m 'chore\(agent\): drop run artifacts'/);
});

test("the default templates no longer name a repo toolchain", () => {
  // The whole point of {{CONVENTIONS}}: a kit default that says `uv run` has
  // silently made every consumer a Python repo.
  for (const file of Object.keys(SUPPLIED)) {
    const source = readFileSync(
      fileURLToPath(new URL(`../../templates/implement/${file}`, import.meta.url)),
      "utf8",
    );
    assert.doesNotMatch(source, /\buv run\b|\bpytest\b|\bpre-commit\b/, file);
  }
});
