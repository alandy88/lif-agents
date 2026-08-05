import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import type { CollectDeps } from "./collect.mts";
import type { GitExec } from "./git.mts";
import type { HerdrExec } from "./herdr.mts";
import { main, sweep } from "./status.mts";
import type { DispatchTask } from "./types.mts";

const dirs: string[] = [];

after(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lif-status-"));
  dirs.push(dir);
  return dir;
}

function task(id: string, worktree: string, overrides: Partial<DispatchTask> = {}): DispatchTask {
  return {
    id,
    project: "demo",
    harness: "claude",
    mode: "local",
    worktree,
    branch: `worktree-${id}`,
    herdr: { session: "default", workspaceId: "w1", tabId: `t-${id}`, paneId: `p-${id}` },
    briefPath: path.join(worktree, "BRIEF.md"),
    state: "dispatched",
    createdAt: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

/** Per-pane agent states; a pane absent from the map reads as a dead pane. */
function fakeHerdr(states: Record<string, string>): HerdrExec {
  return async (args) => {
    const pane = args[args.length - 1] ?? "";
    const state = states[pane];
    if (state === undefined) return { stdout: "", stderr: "no such agent", code: 1 };
    return {
      stdout: JSON.stringify({ result: { agent: { agent_status: state, pane_id: pane } } }),
      stderr: "",
      code: 0,
    };
  };
}

/** Keyed by worktree cwd so each task can present different git truth. */
function fakeGit(byCwd: Record<string, { status: string; log: string }>): GitExec {
  return async (args, cwd) => {
    const truth = byCwd[cwd ?? ""];
    if (!truth) throw new Error(`fake git: no truth for cwd ${cwd}`);
    const stdout = args[0] === "status" ? truth.status : truth.log;
    return { stdout, stderr: "", code: 0 };
  };
}

function deps(dir: string, gitExec: GitExec, herdrExec: HerdrExec, out: string[]): CollectDeps {
  return {
    dir,
    gitExec,
    herdrExec,
    ghExec: async () => ({ stdout: "", stderr: "", code: 0 }),
    env: {},
    out: (line) => out.push(line),
  };
}

function write(dir: string, tasks: DispatchTask[]): void {
  fs.writeFileSync(path.join(dir, "tasks.json"), JSON.stringify({ tasks }), "utf8");
  fs.writeFileSync(
    path.join(dir, "projects.json"),
    JSON.stringify({ projects: { demo: { path: path.join(dir, "repo") } } }),
    "utf8",
  );
}

test("an empty store prints no open tasks", async () => {
  const dir = tmpDir();
  write(dir, []);
  const out: string[] = [];
  assert.equal(await main(deps(dir, fakeGit({}), fakeHerdr({}), out)), 0);
  assert.deepEqual(out, ["no open tasks"]);
});

test("sweep flags blocked, survives a gone pane, and skips closed tasks", async () => {
  const dir = tmpDir();
  const live = path.join(dir, "a");
  const orphan = path.join(dir, "b");
  const closed = path.join(dir, "c");
  fs.mkdirSync(live);
  fs.mkdirSync(orphan);
  write(dir, [
    task("a", live),
    task("b", orphan, { state: "collected" }),
    task("c", closed, { state: "landed" }),
    task("d", closed, { state: "abandoned" }),
  ]);

  const out: string[] = [];
  const lines = await sweep(
    deps(
      dir,
      fakeGit({
        [live]: { status: " M src/a.mts", log: "abc1234 feat: x\ndef5678 fix: y" },
        [orphan]: { status: "", log: "" },
      }),
      fakeHerdr({ "p-a": "blocked" }),
      out,
    ),
  );

  assert.equal(lines.length, 2);
  assert.equal(lines[0]?.agent, "blocked");
  assert.equal(lines[0]?.worktree, "dirty");
  assert.equal(lines[0]?.unlanded, 2);
  // The pane is gone; Git is still the record.
  assert.equal(lines[1]?.agent, "gone");
  assert.equal(lines[1]?.worktree, "clean");
  assert.equal(lines[1]?.unlanded, 0);
});

test("a missing worktree reads as missing rather than throwing", async () => {
  const dir = tmpDir();
  const gone = path.join(dir, "gone");
  write(dir, [task("a", gone)]);

  const out: string[] = [];
  assert.equal(await main(deps(dir, fakeGit({}), fakeHerdr({ "p-a": "working" }), out)), 0);
  assert.equal(out.length, 1);
  assert.match(out[0] ?? "", /worktree=missing/);
  assert.match(out[0] ?? "", /agent=working/);
});

test("the printed line shouts about a blocked agent", async () => {
  const dir = tmpDir();
  const live = path.join(dir, "a");
  fs.mkdirSync(live);
  write(dir, [task("a", live)]);

  const out: string[] = [];
  await main(
    deps(
      dir,
      fakeGit({ [live]: { status: "", log: "" } }),
      fakeHerdr({ "p-a": "blocked" }),
      out,
    ),
  );
  assert.match(out[0] ?? "", /!! BLOCKED/);
});
