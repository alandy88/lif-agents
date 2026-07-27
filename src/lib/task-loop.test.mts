import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureTaskList, runChecklistLoop, type ChecklistLoopDeps } from "./task-loop.mts";
import { parseTaskList } from "./task-list.mts";

type Call = { index: number; attempt: number };

function makeDeps(commitsFor: (call: Call) => number) {
  const state = {
    runs: [] as Call[],
    recorded: [] as number[],
    checkedOff: [] as number[],
    pushes: 0,
  };
  const deps: ChecklistLoopDeps = {
    runTask: async (index, _task, attempt) => {
      state.runs.push({ index, attempt });
      return { commits: commitsFor({ index, attempt }) };
    },
    recordDone: async (index) => {
      state.recorded.push(index);
    },
    checkOff: async (index) => {
      state.checkedOff.push(index);
    },
    pushBranch: async () => {
      state.pushes += 1;
    },
  };
  return { deps, state };
}

const THREE_TASKS = parseTaskList("- [ ] one\n- [ ] two\n- [ ] three\n");

test("happy path: every task runs once, records, checks off, pushes", async () => {
  const { deps, state } = makeDeps(() => 1);
  const done = new Set<number>();
  const result = await runChecklistLoop(THREE_TASKS, done, deps);
  assert.deepEqual(result, { kind: "complete", completed: [1, 2, 3], skippedDone: [] });
  assert.deepEqual(state.runs, [
    { index: 1, attempt: 1 },
    { index: 2, attempt: 1 },
    { index: 3, attempt: 1 },
  ]);
  assert.deepEqual(state.recorded, [1, 2, 3]);
  assert.deepEqual(state.checkedOff, [1, 2, 3]);
  assert.equal(state.pushes, 3);
  assert.deepEqual([...done], [1, 2, 3]);
});

test("resume: trailer-done and body-checked tasks are skipped, not re-run", async () => {
  const tasks = parseTaskList("- [x] one\n- [ ] two\n- [ ] three\n");
  const { deps, state } = makeDeps(() => 1);
  const result = await runChecklistLoop(tasks, new Set([2]), deps);
  assert.deepEqual(result, { kind: "complete", completed: [3], skippedDone: [1, 2] });
  assert.deepEqual(state.runs, [{ index: 3, attempt: 1 }]);
});

test("a no-commit task retries once with a fresh context, then succeeds", async () => {
  const { deps, state } = makeDeps(({ index, attempt }) =>
    index === 2 && attempt === 1 ? 0 : 1,
  );
  const result = await runChecklistLoop(THREE_TASKS, new Set(), deps);
  assert.equal(result.kind, "complete");
  assert.deepEqual(state.runs, [
    { index: 1, attempt: 1 },
    { index: 2, attempt: 1 },
    { index: 2, attempt: 2 },
    { index: 3, attempt: 1 },
  ]);
});

test("stuck after retry stops the loop and reports completed + remaining", async () => {
  const { deps, state } = makeDeps(({ index }) => (index === 2 ? 0 : 1));
  const result = await runChecklistLoop(THREE_TASKS, new Set(), deps);
  assert.deepEqual(result, {
    kind: "stuck",
    taskIndex: 2,
    completed: [1],
    skippedDone: [],
    remaining: [3],
  });
  // Task 1's progress was still recorded and pushed; task 3 never ran.
  assert.deepEqual(state.recorded, [1]);
  assert.equal(state.pushes, 1);
  assert.equal(state.runs.filter((r) => r.index === 3).length, 0);
});

test("ensureTaskList passes an existing checklist through without planning", async () => {
  const { tasks, planned } = await ensureTaskList("- [ ] existing\n", {
    plan: async () => assert.fail("planner must not run"),
    refetchBody: async () => assert.fail("no refetch without planning"),
  });
  assert.equal(planned, false);
  assert.equal(tasks.length, 1);
});

test("ensureTaskList plans when the body has no checklist, then re-parses", async () => {
  let plannedCalls = 0;
  const { tasks, planned } = await ensureTaskList("just prose", {
    plan: async () => {
      plannedCalls += 1;
    },
    refetchBody: async () => "intro\n\n## Tasks\n- [ ] planned task\n",
  });
  assert.equal(plannedCalls, 1);
  assert.equal(planned, true);
  assert.deepEqual(tasks, [{ text: "planned task", checked: false }]);
});

test("ensureTaskList fails when the planner leaves no checklist behind", async () => {
  await assert.rejects(
    ensureTaskList("just prose", {
      plan: async () => {},
      refetchBody: async () => "still just prose",
    }),
    /did not leave a task checklist/,
  );
});
