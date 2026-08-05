import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { abandon, collect, land } from "./collect.mts";
import type { CollectDeps } from "./collect.mts";
import type { GitExec, GitResult } from "./git.mts";
import type { HerdrExec } from "./herdr.mts";
import { getTask } from "./store.mts";
import type { DispatchTask } from "./types.mts";

const dirs: string[] = [];

after(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

type Route = string | Partial<GitResult>;

/** Longest substring match, so "worktree remove" and "worktree prune" are
 *  distinguishable without restating full argument vectors. */
function route(routes: Record<string, Route>, key: string): Route | undefined {
  const hit = Object.keys(routes)
    .filter((candidate) => key.includes(candidate))
    .sort((a, b) => b.length - a.length)[0];
  return hit === undefined ? undefined : routes[hit];
}

function toResult(hit: Route): GitResult {
  if (typeof hit === "string") return { stdout: hit, stderr: "", code: 0 };
  return { stdout: hit.stdout ?? "", stderr: hit.stderr ?? "", code: hit.code ?? 0 };
}

function fakeGit(routes: Record<string, Route>, log: string[]): GitExec {
  return async (args) => {
    const key = args.join(" ");
    log.push(`git ${key}`);
    const hit = route(routes, key);
    if (hit === undefined) throw new Error(`fake git: no route for "${key}"`);
    return toResult(hit);
  };
}

function fakeHerdr(routes: Record<string, Route> | "dead", log: string[]): HerdrExec {
  return async (args) => {
    const key = args.slice(2).join(" ");
    log.push(`herdr ${key}`);
    if (routes === "dead") return { stdout: "", stderr: "no such pane", code: 1 };
    const hit = route(routes, key);
    if (hit === undefined) throw new Error(`fake herdr: no route for "${key}"`);
    const result = toResult(hit);
    return { stdout: result.stdout, stderr: result.stderr, code: result.code };
  };
}

function agentJson(state: string): string {
  return JSON.stringify({ result: { agent: { agent_status: state, pane_id: "p1" } } });
}

const TAB_CLOSED = JSON.stringify({ result: { ok: true } });

interface Fixture {
  dir: string;
  task: DispatchTask;
  worktree: string;
  projectPath: string;
  out: string[];
  log: string[];
}

function setup(overrides: Partial<DispatchTask> = {}, makeWorktree = true): Fixture {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lif-collect-"));
  dirs.push(dir);
  const worktree = path.join(dir, "wt");
  if (makeWorktree) fs.mkdirSync(worktree);
  const projectPath = path.join(dir, "repo");
  const task: DispatchTask = {
    id: "demo-task-ab12",
    project: "demo",
    harness: "claude",
    mode: "local",
    worktree,
    branch: "worktree-demo-task",
    herdr: { session: "default", workspaceId: "w1", tabId: "t1", paneId: "p1" },
    briefPath: path.join(worktree, "BRIEF.md"),
    state: "dispatched",
    createdAt: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
  fs.writeFileSync(path.join(dir, "tasks.json"), JSON.stringify({ tasks: [task] }), "utf8");
  fs.writeFileSync(
    path.join(dir, "projects.json"),
    JSON.stringify({ projects: { demo: { path: projectPath } } }),
    "utf8",
  );
  return { dir, task, worktree, projectPath, out: [], log: [] };
}

function deps(
  fx: Fixture,
  gitRoutes: Record<string, Route>,
  herdrRoutes: Record<string, Route> | "dead",
  gh: GitResult = { stdout: "", stderr: "", code: 0 },
): CollectDeps {
  return {
    dir: fx.dir,
    gitExec: fakeGit(gitRoutes, fx.log),
    herdrExec: fakeHerdr(herdrRoutes, fx.log),
    ghExec: async (args) => {
      fx.log.push(`gh ${args.join(" ")}`);
      return gh;
    },
    env: {},
    out: (line) => fx.out.push(line),
    now: () => "2026-08-05T12:00:00.000Z",
  };
}

test("collect reports git truth and writes a note stub even when the pane is gone", async () => {
  const fx = setup();
  const report = await collect(
    fx.task.id,
    deps(
      fx,
      {
        "status --porcelain": "",
        "log main..HEAD": "abc1234 feat: the thing",
        "diff --stat": " src/a.mts | 3 +++",
      },
      "dead",
    ),
  );

  assert.equal(report.agentState, "gone");
  assert.equal(report.truth.commits.length, 1);
  const text = fx.out.join("\n");
  assert.match(text, /abc1234 feat: the thing/);
  assert.match(text, /src\/a\.mts/);
  assert.match(text, /work present: 1 commit/);

  const note = fs.readFileSync(path.join(fx.dir, "notes", `${fx.task.id}.md`), "utf8");
  assert.match(note, /# demo-task-ab12/);
  assert.match(note, /abc1234 feat: the thing/);
  assert.match(note, /worktree-demo-task \(base main\)/);

  const stored = getTask(fx.task.id, fx.dir);
  assert.equal(stored.state, "collected");
  assert.equal(stored.collectedAt, "2026-08-05T12:00:00.000Z");
  assert.equal(stored.result?.notePath, path.join(fx.dir, "notes", `${fx.task.id}.md`));
});

test("collect flags a possible unanswered question on clean + no commits + idle", async () => {
  const fx = setup();
  await collect(
    fx.task.id,
    deps(
      fx,
      { "status --porcelain": "", "log main..HEAD": "", "diff --stat": "" },
      { "agent get": agentJson("idle"), "pane read": "Which base branch should I use?" },
    ),
  );

  const text = fx.out.join("\n");
  assert.match(text, /WAITING ON A QUESTION/);
  assert.match(text, /Which base branch should I use\?/);
  // The pane tail must be printed before the label, never after.
  assert.ok(text.indexOf("Which base branch") < text.indexOf("WAITING ON A QUESTION"));
});

test("collect stops when the worktree is gone and suggests abandon", async () => {
  const fx = setup({}, false);
  const report = await collect(fx.task.id, deps(fx, {}, "dead"));

  assert.equal(report.ok, false);
  assert.match(fx.out.join("\n"), /no longer exists on disk/);
  assert.match(fx.out.join("\n"), /abandon demo-task-ab12/);
  assert.equal(getTask(fx.task.id, fx.dir).state, "dispatched");
});

test("collect surfaces a blocked agent loudly", async () => {
  const fx = setup();
  await collect(
    fx.task.id,
    deps(
      fx,
      { "status --porcelain": "", "log main..HEAD": "", "diff --stat": "" },
      { "agent get": agentJson("blocked"), "pane read": "Allow write to file? (y/n)" },
    ),
  );
  assert.match(fx.out.join("\n"), /!! BLOCKED/);
});

test("land in local mode keeps the worktree and names abandon as the cleanup path", async () => {
  const fx = setup();
  const report = await land(
    fx.task.id,
    deps(
      fx,
      { "status --porcelain": "", "log main..HEAD": "abc1234 feat: x", "diff --stat": "" },
      "dead",
    ),
  );

  assert.equal(report.ok, true);
  assert.equal(report.pushed, false);
  assert.match(fx.out.join("\n"), /abandon demo-task-ab12/);
  assert.equal(getTask(fx.task.id, fx.dir).state, "landed");
  assert.ok(!fx.log.some((line) => line.includes("push")));
});

test("land in pr mode refuses when the branch is behind base and never pushes", async () => {
  const fx = setup({ mode: "pr" });
  const report = await land(
    fx.task.id,
    deps(
      fx,
      {
        "status --porcelain": "",
        "log main..HEAD": "abc1234 feat: x",
        "diff --stat": "",
        "rev-list --count": "4",
      },
      "dead",
    ),
  );

  assert.equal(report.ok, false);
  assert.deepEqual(report.reasons, ["behind main by 4"]);
  assert.match(fx.out.join("\n"), /4 commit\(s\) behind main/);
  assert.ok(!fx.log.some((line) => line.includes("push")));
  assert.ok(!fx.log.some((line) => line.startsWith("gh ")));
  assert.equal(getTask(fx.task.id, fx.dir).state, "dispatched");
});

test("land in pr mode still lands when gh is missing, reporting the pushed branch", async () => {
  const fx = setup({ mode: "pr" });
  const report = await land(
    fx.task.id,
    deps(
      fx,
      {
        "status --porcelain": "",
        "log main..HEAD": "abc1234 feat: x",
        "diff --stat": "",
        "rev-list --count": "0",
        "push -u origin": "",
      },
      "dead",
      { stdout: "", stderr: "gh: command not found", code: 127 },
    ),
  );

  assert.equal(report.ok, true);
  assert.equal(report.pushed, true);
  assert.equal(report.prUrl, undefined);
  const text = fx.out.join("\n");
  assert.match(text, /gh pr create failed/);
  assert.match(text, /worktree-demo-task is pushed/);
  assert.equal(getTask(fx.task.id, fx.dir).state, "landed");
});

test("land in pr mode records the PR url when gh succeeds", async () => {
  const fx = setup({ mode: "pr" });
  const report = await land(
    fx.task.id,
    deps(
      fx,
      {
        "status --porcelain": "",
        "log main..HEAD": "abc1234 feat: x",
        "diff --stat": "",
        "rev-list --count": "0",
        "push -u origin": "",
      },
      "dead",
      { stdout: "https://github.com/o/r/pull/7\n", stderr: "", code: 0 },
    ),
  );

  assert.equal(report.prUrl, "https://github.com/o/r/pull/7");
  assert.equal(getTask(fx.task.id, fx.dir).result?.prUrl, "https://github.com/o/r/pull/7");
});

test("abandon refuses a dirty worktree without --discard, and forces with it", async () => {
  const fx = setup();
  const routes: Record<string, Route> = {
    "status --porcelain": " M src/a.mts",
    "log main..HEAD": "",
    "worktree remove": "",
    "worktree prune": "",
    "branch -D": "",
  };

  const refused = await abandon(fx.task.id, { discard: false }, deps(fx, routes, "dead"));
  assert.equal(refused.ok, false);
  assert.match(refused.reasons.join(), /uncommitted changes/);
  assert.ok(!fx.log.some((line) => line.includes("worktree remove")));
  assert.equal(getTask(fx.task.id, fx.dir).state, "dispatched");

  fx.log.length = 0;
  const forced = await abandon(
    fx.task.id,
    { discard: true },
    deps(fx, routes, { "tab close": TAB_CLOSED }),
  );
  assert.equal(forced.ok, true);
  assert.ok(fx.log.some((line) => line.includes("worktree remove") && line.includes("--force")));
  assert.ok(fx.log.some((line) => line.includes("worktree prune")));
  // The tab is a husk only after Git state has been read; never before.
  const readAt = fx.log.findIndex((line) => line.includes("status --porcelain"));
  const closeAt = fx.log.findIndex((line) => line.includes("tab close"));
  assert.ok(readAt >= 0 && closeAt > readAt);
  assert.equal(getTask(fx.task.id, fx.dir).state, "abandoned");
});

test("abandon refuses unlanded commits, and allows them once the task is landed", async () => {
  const fx = setup();
  const routes: Record<string, Route> = {
    "status --porcelain": "",
    "log main..HEAD": "abc1234 feat: x",
    "worktree remove": "",
    "worktree prune": "",
    "branch -d": "",
  };

  const refused = await abandon(fx.task.id, { discard: false }, deps(fx, routes, "dead"));
  assert.equal(refused.ok, false);
  assert.match(refused.reasons.join(), /1 unlanded commit/);

  const landedFx = setup({ state: "landed" });
  const ok = await abandon(
    landedFx.task.id,
    { discard: false },
    deps(landedFx, routes, { "tab close": TAB_CLOSED }),
  );
  assert.equal(ok.ok, true);
  assert.ok(landedFx.log.some((line) => line.includes("branch -d")));
});

test("abandon cleans up a missing worktree and tolerates a failed branch delete", async () => {
  const fx = setup({}, false);
  const report = await abandon(
    fx.task.id,
    { discard: false },
    deps(
      fx,
      {
        "worktree prune": "",
        "branch -d": { code: 1, stderr: "error: branch not fully merged" },
      },
      "dead",
    ),
  );

  assert.equal(report.ok, true);
  assert.ok(!fx.log.some((line) => line.includes("worktree remove")));
  assert.ok(fx.log.some((line) => line.includes("worktree prune")));
  assert.match(report.warnings.join("\n"), /not fully merged/);
  assert.match(report.warnings.join("\n"), /tab t1 not closed/);
  assert.equal(getTask(fx.task.id, fx.dir).state, "abandoned");
});
