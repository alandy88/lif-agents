import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkOffTask,
  parseTaskDoneTrailers,
  parseTaskList,
  renderTaskList,
  stripTaskSection,
  taskDoneTrailer,
} from "./task-list.mts";

const BODY = [
  "Some intro prose with a - [ ] fake inline item.",
  "",
  "## Tasks",
  "",
  "- [ ] Add the parser",
  "- [x] Write the failing test",
  "* [ ] Wire the route",
  "  - [X] Indented nested task",
  "- plain bullet, not a task",
  "",
  "Closing prose.",
].join("\n");

test("parseTaskList keeps only task-list lines, in order, with checked state", () => {
  assert.deepEqual(parseTaskList(BODY), [
    { text: "Add the parser", checked: false },
    { text: "Write the failing test", checked: true },
    { text: "Wire the route", checked: false },
    { text: "Indented nested task", checked: true },
  ]);
});

test("parseTaskList returns [] for a body with no checklist", () => {
  assert.deepEqual(parseTaskList("Just prose.\n- a bare bullet\n"), []);
});

test("checkOffTask checks exactly the indexed box and preserves the rest", () => {
  const updated = checkOffTask(BODY, 3);
  assert.match(updated, /^\* \[x\] Wire the route$/m);
  assert.match(updated, /^- \[ \] Add the parser$/m);
  assert.equal(parseTaskList(updated)[2].checked, true);
});

test("checkOffTask is a no-op for out-of-range or already-checked items", () => {
  assert.equal(checkOffTask(BODY, 99), BODY);
  assert.equal(checkOffTask(BODY, 2), BODY);
});

test("Task-Done trailers round-trip through a git log blob", () => {
  const log = [
    "commit abc",
    "",
    "    feat: add the parser",
    "",
    `    ${taskDoneTrailer(1)}`,
    "commit def",
    "",
    "    prose mentioning Task-Done: 9 inline should not count",
    "",
    "    Task-Done: 3",
  ].join("\n");
  assert.deepEqual([...parseTaskDoneTrailers(log)], [1, 3]);
});

test("parseTaskDoneTrailers degrades to empty on no matches", () => {
  assert.equal(parseTaskDoneTrailers("no trailers here").size, 0);
});

test("renderTaskList numbers items and merges body + trailer done state", () => {
  const tasks = parseTaskList("- [ ] one\n- [x] two\n- [ ] three\n");
  assert.equal(
    renderTaskList(tasks, new Set([3])),
    "1. [ ] one\n2. [x] two\n3. [x] three",
  );
});

test("stripTaskSection leaves one authoritative checklist for task prompts", () => {
  const body = [
    "Intro.",
    "",
    "## Tasks",
    "- [ ] stale task",
    "",
    "### Notes inside tasks",
    "Still part of the task section.",
    "",
    "## Acceptance criteria",
    "Keep this section.",
  ].join("\n");

  assert.equal(
    stripTaskSection(body),
    "Intro.\n\n## Acceptance criteria\nKeep this section.",
  );
  assert.equal(stripTaskSection("No task heading.\n- [ ] unrelated"), "No task heading.\n- [ ] unrelated");
});
