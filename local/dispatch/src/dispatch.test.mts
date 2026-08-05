import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { parseContractMode } from "./brief.mts";
import { agentName, runDispatch } from "./dispatch.mts";
import type { DispatchDeps, DispatchOptions } from "./dispatch.mts";
import type { GitExec, GitResult } from "./git.mts";
import type { HerdrExec, HerdrExecResult } from "./herdr.mts";
import { getTask } from "./store.mts";
import { projectsPath } from "./store.mts";

const dirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lif-dispatch-"));
  dirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

const PROJECT_PATH = path.join(os.tmpdir(), "lif-dispatch-primary", "app");

function configWith(dir: string, overrides: Record<string, unknown> = {}): string {
  const scratchRoot = path.join(dir, "wt");
  fs.writeFileSync(
    projectsPath(dir),
    JSON.stringify({
      scratchRoot,
      projects: { app: { path: PROJECT_PATH, baseBranch: "main" } },
      ...overrides,
    }),
    "utf8",
  );
  return scratchRoot;
}

interface Seams {
  gitCalls: string[][];
  herdrCalls: string[][];
  deps: DispatchDeps;
}

interface SeamOverrides {
  /** Toplevel returned for `rev-parse --show-toplevel` inside the worktree. */
  worktreeTop?: (cwd: string | undefined) => string;
  failAgentStart?: boolean;
}

function seams(dir: string, overrides: SeamOverrides = {}): Seams {
  const gitCalls: string[][] = [];
  const herdrCalls: string[][] = [];

  const ok = (stdout: string): GitResult => ({ stdout, stderr: "", code: 0 });

  const gitExec: GitExec = async (args, cwd) => {
    gitCalls.push(args);
    if (args.includes("worktree")) return ok("");
    if (args.includes("rev-parse")) {
      if (args[0] === "-C") return ok(`${args[1]}\n`);
      return ok(`${overrides.worktreeTop ? overrides.worktreeTop(cwd) : (cwd ?? "")}\n`);
    }
    return ok("");
  };

  const herdrExec: HerdrExec = async (args) => {
    herdrCalls.push(args);
    const json = (result: unknown): HerdrExecResult => ({
      stdout: JSON.stringify({ result }),
      stderr: "",
      code: 0,
    });
    if (args.includes("workspace") && args.includes("list")) {
      return json({ workspaces: [{ workspace_id: "ws-1", label: "lif-dispatch" }] });
    }
    if (args.includes("tab") && args.includes("create")) {
      return json({ tab: { tab_id: "tab-1" }, root_pane: { pane_id: "pane-1" } });
    }
    if (args.includes("agent") && args.includes("start")) {
      if (overrides.failAgentStart) {
        return { stdout: "", stderr: '{"error":{"message":"kind unavailable"}}', code: 1 };
      }
      return json({ agent: { agent_id: "a-1" } });
    }
    throw new Error(`unexpected herdr call: ${args.join(" ")}`);
  };

  return {
    gitCalls,
    herdrCalls,
    deps: {
      configDir: dir,
      gitExec,
      herdrExec,
      env: {},
      now: () => new Date("2026-08-05T12:00:00.000Z"),
      log: () => {},
    },
  };
}

function options(overrides: Partial<DispatchOptions> = {}): DispatchOptions {
  return { project: "app", task: "Add the widget", ...overrides };
}

test("agentName conforms to herdr's [a-z][a-z0-9_-]{0,31}", () => {
  assert.match(agentName("app-add-the-widget-ab12"), /^[a-z][a-z0-9_-]{0,31}$/);
  assert.match(agentName("2fast/Furious"), /^t-2fast-furious$/);
  assert.ok(agentName(`p-${"x".repeat(60)}`).length <= 32);
});

test("an unverified harness refuses before any git or herdr call", async () => {
  const dir = tmpDir();
  configWith(dir);
  const s = seams(dir);
  await assert.rejects(
    runDispatch(options({ harness: "codex" }), s.deps),
    /no verified adapter for harness "codex"/,
  );
  assert.equal(s.gitCalls.length, 0);
  assert.equal(s.herdrCalls.length, 0);
});

test("an unknown harness, effort or mode refuses before any side effect", async () => {
  const dir = tmpDir();
  configWith(dir);
  const s = seams(dir);
  await assert.rejects(runDispatch(options({ harness: "kimi" }), s.deps), /Invalid harness/);
  await assert.rejects(runDispatch(options({ effort: "extreme" }), s.deps), /Invalid effort/);
  await assert.rejects(runDispatch(options({ mode: "push" }), s.deps), /Invalid mode/);
  assert.equal(s.gitCalls.length, 0);
  assert.equal(s.herdrCalls.length, 0);
});

test("--task and --brief are mutually exclusive and one is required", async () => {
  const dir = tmpDir();
  configWith(dir);
  const s = seams(dir);
  await assert.rejects(
    runDispatch({ project: "app", task: "x", briefPath: "b.md" }, s.deps),
    /exactly one of --task or --brief/,
  );
  await assert.rejects(runDispatch({ project: "app" }, s.deps), /exactly one of --task or --brief/);
  assert.equal(s.gitCalls.length, 0);
});

test("a failing worktree add surfaces git's words and suggests prune", async () => {
  const dir = tmpDir();
  configWith(dir);
  const s = seams(dir);
  s.deps.gitExec = async () => ({
    stdout: "",
    stderr: "fatal: 'dispatch/app-x' is already checked out",
    code: 128,
  });
  await assert.rejects(runDispatch(options(), s.deps), (error: Error) => {
    assert.match(error.message, /already checked out/);
    assert.match(error.message, /worktree prune/);
    return true;
  });
});

test("a failed isolation assertion aborts before tabCreate", async () => {
  const dir = tmpDir();
  configWith(dir);
  // The worktree resolves to the project's primary checkout: the exact
  // failure the double assertion exists to catch.
  const s = seams(dir, { worktreeTop: () => PROJECT_PATH });
  await assert.rejects(runDispatch(options(), s.deps), (error: Error) => {
    assert.match(error.message, /isolation assertion failed/);
    assert.ok(error.message.includes(PROJECT_PATH));
    return true;
  });
  assert.equal(s.herdrCalls.length, 0);
});

test("--brief refuses when the contract line disagrees with --mode", async () => {
  const dir = tmpDir();
  configWith(dir);
  const s = seams(dir);
  const brief = path.join(dir, "hand-written.md");
  fs.writeFileSync(brief, "# Task\n\nDelivery contract: mode=local\n", "utf8");

  await assert.rejects(
    runDispatch({ project: "app", briefPath: brief, mode: "pr" }, s.deps),
    /declares delivery contract mode=local.*--mode is pr/s,
  );
  assert.equal(s.herdrCalls.length, 0);

  fs.writeFileSync(brief, "# Task\n\nno contract here\n", "utf8");
  await assert.rejects(
    runDispatch({ project: "app", briefPath: brief, mode: "local" }, s.deps),
    /mode=\(unreadable\)/,
  );
});

test("--brief launches when the contract agrees", async () => {
  const dir = tmpDir();
  configWith(dir);
  const s = seams(dir);
  const brief = path.join(dir, "hand-written.md");
  fs.writeFileSync(brief, "# Task\n\nDelivery contract: mode=pr\n", "utf8");

  const { task } = await runDispatch({ project: "app", briefPath: brief, mode: "pr" }, s.deps);
  assert.equal(task.mode, "pr");
  assert.equal(task.briefPath, path.resolve(brief));
});

test("the happy path records a task that round-trips and delivers the brief last", async () => {
  const dir = tmpDir();
  const scratchRoot = configWith(dir);
  const s = seams(dir);

  const { task, briefText } = await runDispatch(
    options({ model: "opus", effort: "high" }),
    s.deps,
  );

  const stored = getTask(task.id, dir);
  assert.deepEqual(stored, task);
  assert.equal(stored.project, "app");
  assert.equal(stored.harness, "claude");
  assert.equal(stored.model, "opus");
  assert.equal(stored.mode, "local");
  assert.equal(stored.state, "dispatched");
  assert.equal(stored.branch, `dispatch/${task.id}`);
  assert.equal(stored.worktree, path.join(scratchRoot, task.id));
  assert.deepEqual(stored.herdr, {
    session: "default",
    workspaceId: "ws-1",
    tabId: "tab-1",
    paneId: "pane-1",
  });
  assert.equal(stored.createdAt, "2026-08-05T12:00:00.000Z");

  // The brief is written where the record says it is, and its contract line
  // agrees with the recorded mode.
  assert.equal(stored.briefPath, path.join(dir, "briefs", `${task.id}.md`));
  assert.equal(fs.readFileSync(stored.briefPath, "utf8"), briefText);
  assert.equal(parseContractMode(briefText), "local");

  const worktreeAdd = s.gitCalls.find((c) => c.includes("worktree"));
  assert.deepEqual(worktreeAdd, [
    "-C",
    PROJECT_PATH,
    "worktree",
    "add",
    stored.worktree,
    "-b",
    stored.branch,
    "main",
  ]);

  const tabCreate = s.herdrCalls.find((c) => c.includes("tab") && c.includes("create"));
  assert.ok(tabCreate?.includes(stored.worktree), "tab is created with the worktree as cwd");
  assert.ok(tabCreate?.includes(task.id), "tab is labeled with the task id");

  const start = s.herdrCalls.find((c) => c.includes("agent") && c.includes("start"));
  assert.ok(start);
  const pointer = start.at(-1);
  assert.ok(
    pointer !== undefined && pointer.includes(stored.briefPath) && !pointer.includes("\n"),
    "the final positional native arg is a one-line pointer to the brief file",
  );
  assert.ok(start.includes("--dangerously-skip-permissions"));
  assert.deepEqual(start.slice(start.indexOf("--") + 1, -1), [
    "--dangerously-skip-permissions",
    "--model",
    "opus",
  ]);
  assert.equal(start.includes("pane-1"), true);
});

test("claude omits the effort flag but the task still records the request", async () => {
  const dir = tmpDir();
  configWith(dir);
  const s = seams(dir);

  const { task } = await runDispatch(options({ effort: "xhigh" }), s.deps);
  assert.equal(getTask(task.id, dir).effort, "xhigh");

  const start = s.herdrCalls.find((c) => c.includes("agent") && c.includes("start"));
  assert.ok(start);
  assert.ok(!start.some((a) => a.includes("effort")), `effort leaked into ${start.join(" ")}`);
});

test("a failed agentStart still records the task, naming it in the error", async () => {
  const dir = tmpDir();
  const scratchRoot = configWith(dir);
  const s = seams(dir, { failAgentStart: true });

  await assert.rejects(runDispatch(options(), s.deps), (error: Error) => {
    assert.match(error.message, /Agent start failed for task app-add-the-widget-[0-9a-f]{4}/);
    assert.match(error.message, /kind unavailable/);
    return true;
  });

  const tasks = JSON.parse(fs.readFileSync(path.join(dir, "tasks.json"), "utf8")) as {
    tasks: { id: string; worktree: string; herdr: { tabId: string } }[];
  };
  assert.equal(tasks.tasks.length, 1);
  const recorded = tasks.tasks[0];
  assert.ok(recorded);
  assert.equal(recorded.herdr.tabId, "tab-1");
  assert.equal(recorded.worktree, path.join(scratchRoot, recorded.id));
});

test("session comes from the projects config", async () => {
  const dir = tmpDir();
  configWith(dir, { session: "lab" });
  const s = seams(dir);

  const { task } = await runDispatch(options(), s.deps);
  assert.equal(task.herdr.session, "lab");
  assert.ok(s.herdrCalls.every((c) => c[0] === "--session" && c[1] === "lab"));
});
