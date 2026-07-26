import { test } from "node:test";
import assert from "node:assert/strict";
import { type Issue } from "./github-issue.mts";
import { admit, type IntakeReads } from "./issue-intake.mts";

function makeReads(overrides: { issue?: Partial<Issue>; isEpic?: boolean }): IntakeReads {
  const issue: Issue = {
    title: "Fix the widget",
    body: "It is broken.",
    state: "OPEN",
    labels: ["ready-for-agent"],
    ...overrides.issue,
  };
  return {
    getIssue: async () => issue,
    issueIsEpic: async () => overrides.isEpic ?? false,
  };
}

test("a closed issue is rejected", async () => {
  const reads = makeReads({ issue: { state: "CLOSED" } });
  const admission = await admit({ issueNumber: 7 }, reads);
  assert.equal(admission.kind, "rejected");
  assert.match((admission as { detail: string }).detail, /is closed/);
});

test("a label removed while queued skips on a label-triggered run", async () => {
  const reads = makeReads({ issue: { labels: [] } });
  const admission = await admit({ issueNumber: 7, trigger: "issues" }, reads);
  assert.equal(admission.kind, "skipped");
  assert.match((admission as { reason: string }).reason, /ready-for-agent/);
});

test("a missing label does not block workflow_dispatch", async () => {
  const reads = makeReads({ issue: { labels: [] } });
  const admission = await admit({ issueNumber: 7, trigger: "workflow_dispatch" }, reads);
  assert.equal(admission.kind, "admitted");
});

test("an epic is rejected", async () => {
  const reads = makeReads({ isEpic: true });
  const admission = await admit({ issueNumber: 7 }, reads);
  assert.equal(admission.kind, "rejected");
  assert.match((admission as { detail: string }).detail, /sub-issues/);
});

// This asymmetry is what `main` relies on: the issue gets the wrapped
// "configuration rejected" text, while the log (and the rethrown error) gets
// the raw `resolvePhases` error underneath it via `cause`.
test("an unknown agent label is rejected, and cause is the original error", async () => {
  const reads = makeReads({ issue: { labels: ["ready-for-agent", "agent:mystery"] } });
  const admission = await admit({ issueNumber: 7 }, reads);
  assert.equal(admission.kind, "rejected");
  const rejected = admission as { detail: string; cause?: unknown };
  assert.match(rejected.detail, /sandcastle-agent configuration rejected/);
  assert.ok(rejected.cause instanceof Error);
  assert.match((rejected.cause as Error).message, /Unknown agent label/);
});

// The only test that pins the resolved profile reaching the caller, since
// `implement.test.mts` now fakes `admit` and no longer exercises resolution.
test("an admitted issue carries the resolved run", async () => {
  const reads = makeReads({ issue: { labels: ["ready-for-agent", "agent:claude"] } });
  const admission = await admit({ issueNumber: 7 }, reads);
  assert.equal(admission.kind, "admitted");
  assert.equal((admission as { run: { name: string } }).run.name, "claude");
});
