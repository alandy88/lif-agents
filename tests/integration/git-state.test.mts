// The loop's durable state lives in git: `Task-Done` trailers on real commits
// and branch names derived from human task labels. The unit tests parse
// hand-written strings; these run the same functions against what git
// actually emits and accepts.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { parseTaskDoneTrailers, taskDoneTrailer } from "../../src/lib/task-list.mts";
import { taskBranch } from "../../src/presets/task/state.mts";
import { gitIn, makeTempRoot, must, removeTempRoot } from "./helpers.mts";

let root: string;
let git: ReturnType<typeof gitIn>;

before(async () => {
  root = makeTempRoot();
  git = gitIn(root);
  await must(git, ["init", "-b", "main"]);
});

after(() => removeTempRoot(root));

test("Task-Done trailers survive a real commit → git log round-trip", async () => {
  // git log's default format indents the body by four spaces — exactly the
  // formatting the parser's anchored regex has to tolerate.
  await must(git, ["commit", "--allow-empty", "-m", `task one\n\n${taskDoneTrailer(1)}`]);
  await must(git, ["commit", "--allow-empty", "-m", `task two\n\n${taskDoneTrailer(2)}`]);
  // Prose mentioning a trailer mid-line must NOT count as one.
  await must(git, [
    "commit",
    "--allow-empty",
    "-m",
    "notes\n\nreverted; see Task-Done: 9 in the earlier discussion",
  ]);

  const log = await must(git, ["log"]);
  assert.deepEqual(parseTaskDoneTrailers(log.stdout), new Set([1, 2]));
});

test("every taskBranch output is a name git will actually create", async () => {
  const labels = [
    "1.4 Nature kit data",
    "Fix: verify/deliver ordering (again!)",
    "Ünïcode täsk läbel",
    "..dots..and..--dashes--..",
    "!!!", // slug collapses to nothing → "task" fallback
    "a label long enough to hit the 48-character slug bound, twice over, easily",
  ];
  for (const label of labels) {
    const branch = taskBranch(label);
    const created = await git(["branch", branch]);
    assert.equal(created.exitCode, 0, `git rejected ${branch} (from "${label}"): ${created.stderr}`);
    await must(git, ["branch", "-D", branch]);
  }
});
