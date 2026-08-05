import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import {
  addTask,
  getTask,
  loadProjects,
  loadTasks,
  newTaskId,
  openTasks,
  projectsPath,
  resolveProject,
  updateTask,
} from "./store.mts";
import type { DispatchTask } from "./types.mts";

const dirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lif-dispatch-"));
  dirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

function task(id: string, overrides: Partial<DispatchTask> = {}): DispatchTask {
  return {
    id,
    project: "lif-agents",
    harness: "claude",
    mode: "local",
    worktree: path.join(os.tmpdir(), "wt", id),
    branch: `worktree-${id}`,
    herdr: { session: "default", workspaceId: "w1", tabId: "t1", paneId: "p1" },
    briefPath: path.join(os.tmpdir(), "wt", id, "BRIEF.md"),
    state: "dispatched",
    createdAt: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

test("missing tasks.json reads as an empty store", () => {
  assert.deepEqual(loadTasks(tmpDir()), { tasks: [] });
});

test("round-trips add, get and update", () => {
  const dir = tmpDir();
  addTask(task("a-1"), dir);
  addTask(task("a-2"), dir);
  assert.equal(getTask("a-1", dir).branch, "worktree-a-1");

  const updated = updateTask("a-1", { state: "landed", result: { summary: "done" } }, dir);
  assert.equal(updated.state, "landed");
  assert.equal(getTask("a-1", dir).result?.summary, "done");
  assert.equal(getTask("a-2", dir).state, "dispatched");
  assert.deepEqual(
    openTasks(dir).map((t) => t.id),
    ["a-2"],
  );
});

test("refuses a duplicate task id", () => {
  const dir = tmpDir();
  addTask(task("a-1"), dir);
  assert.throws(() => addTask(task("a-1"), dir), /already exists/);
  assert.equal(loadTasks(dir).tasks.length, 1);
});

test("unknown task id error names the known ids", () => {
  const dir = tmpDir();
  addTask(task("a-1"), dir);
  addTask(task("a-2"), dir);
  assert.throws(() => getTask("nope", dir), /Known tasks: a-1, a-2/);
  assert.throws(() => updateTask("nope", { state: "landed" }, dir), /Known tasks: a-1, a-2/);
});

test("a corrupt tasks.json throws instead of resetting", () => {
  const dir = tmpDir();
  addTask(task("a-1"), dir);
  fs.writeFileSync(path.join(dir, "tasks.json"), "{ not json", "utf8");
  assert.throws(() => loadTasks(dir), /Corrupt task store/);

  fs.writeFileSync(path.join(dir, "tasks.json"), '{"tasks":"nope"}', "utf8");
  assert.throws(() => loadTasks(dir), /Corrupt task store/);
});

test("writes are atomic and leave no .tmp behind", () => {
  const dir = tmpDir();
  addTask(task("a-1"), dir);
  updateTask("a-1", { state: "collected" }, dir);
  assert.deepEqual(fs.readdirSync(dir), ["tasks.json"]);
});

test("loadProjects points at the committed example when the file is missing", () => {
  const dir = tmpDir();
  assert.throws(() => loadProjects(dir), (error: Error) => {
    assert.match(error.message, /projects\.example\.json/);
    assert.ok(error.message.includes(projectsPath(dir)));
    return true;
  });
});

test("loadProjects reads a written config", () => {
  const dir = tmpDir();
  fs.writeFileSync(
    projectsPath(dir),
    JSON.stringify({ scratchRoot: "C:/tmp/wt", projects: { app: { path: "D:/Git/app" } } }),
    "utf8",
  );
  const config = loadProjects(dir);
  assert.equal(config.scratchRoot, "C:/tmp/wt");
  assert.equal(config.projects["app"]?.path, "D:/Git/app");
});

test("resolveProject applies the baseBranch default", () => {
  const entry = resolveProject({ projects: { app: { path: path.resolve("/git/app") } } }, "app");
  assert.equal(entry.baseBranch, "main");
});

test("resolveProject rejects relative paths and unknown names", () => {
  const config = { projects: { app: { path: "relative/app" } } };
  assert.throws(() => resolveProject(config, "app"), /must be absolute/);
  assert.throws(() => resolveProject(config, "other"), /Known projects: app/);
});

test("newTaskId slugifies and stays unique", () => {
  const id = newTaskId("lif-agents", "Add the Store Module! (with tests)");
  assert.match(id, /^lif-agents-[a-z0-9-]+-[0-9a-f]{4}$/);
  assert.notEqual(id, newTaskId("lif-agents", "Add the Store Module! (with tests)"));

  const long = newTaskId("p", "aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd");
  assert.ok(long.length <= 1 + 1 + 24 + 1 + 4 + 1, `too long: ${long}`);
  assert.match(newTaskId("p", "!!!"), /^p-task-[0-9a-f]{4}$/);
});
