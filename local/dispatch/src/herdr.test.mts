import assert from "node:assert/strict";
import { test } from "node:test";

import {
  agentGet,
  agentStart,
  HerdrError,
  paneRead,
  tabClose,
  tabCreate,
  workspaceResolve,
} from "./herdr.mts";
import type { HerdrCtx, HerdrExec, HerdrExecResult } from "./herdr.mts";

interface Call {
  args: string[];
  env: NodeJS.ProcessEnv | undefined;
}

/** Routes on the command words (session flag stripped) so fixtures stay readable. */
function fakeExec(
  routes: Record<string, HerdrExecResult | string>,
): { exec: HerdrExec; calls: Call[] } {
  const calls: Call[] = [];
  const exec: HerdrExec = async (args, env) => {
    calls.push({ args, env });
    const words = args.slice(2);
    const end = words.findIndex((a) => a.startsWith("--"));
    const key = (end === -1 ? words : words.slice(0, end)).join(" ");
    const hit = routes[key];
    if (hit === undefined) throw new Error(`fake exec: no route for "${key}"`);
    return typeof hit === "string" ? { stdout: hit, stderr: "", code: 0 } : hit;
  };
  return { exec, calls };
}

function ok(result: unknown): string {
  return JSON.stringify({ id: "cli:test", result });
}

const WORKSPACE_LIST_EMPTY = ok({ type: "workspace_list", workspaces: [] });

function ctxWith(exec: HerdrExec, env: NodeJS.ProcessEnv = {}): HerdrCtx {
  return { session: "default", exec, env };
}

test("every call pins the session in both the flag and the child env", async () => {
  const { exec, calls } = fakeExec({
    "workspace list": WORKSPACE_LIST_EMPTY,
    "workspace create": ok({ workspace: { workspace_id: "w9", label: "lif-dispatch" } }),
  });
  const ctx: HerdrCtx = { session: "lif", exec, env: {} };

  await workspaceResolve(ctx);

  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.deepEqual(call.args.slice(0, 2), ["--session", "lif"]);
    assert.equal(call.env?.["HERDR_SESSION"], "lif");
  }
});

test("outside Herdr, a single labeled workspace is reused", async () => {
  const { exec, calls } = fakeExec({
    "workspace list": ok({
      workspaces: [
        { workspace_id: "w3", label: "other" },
        { workspace_id: "w7", label: "lif-dispatch" },
      ],
    }),
  });

  const resolved = await workspaceResolve(ctxWith(exec));

  assert.equal(resolved.workspaceId, "w7");
  assert.equal(resolved.source, "label");
  assert.equal(calls.length, 1, "must not create when one already exists");
});

test("outside Herdr, zero labeled workspaces creates one unfocused", async () => {
  const { exec, calls } = fakeExec({
    "workspace list": WORKSPACE_LIST_EMPTY,
    "workspace create": ok({
      workspace: { workspace_id: "w9" },
      tab: { tab_id: "w9:t1" },
      root_pane: { pane_id: "w9:p1" },
    }),
  });

  const resolved = await workspaceResolve(ctxWith(exec));

  assert.equal(resolved.workspaceId, "w9");
  assert.ok(calls[1]?.args.includes("--no-focus"));
  assert.ok(calls[1]?.args.includes("lif-dispatch"));
});

test("outside Herdr, two workspaces sharing the label refuse", async () => {
  const { exec } = fakeExec({
    "workspace list": ok({
      workspaces: [
        { workspace_id: "w2", label: "lif-dispatch" },
        { workspace_id: "w5", label: "lif-dispatch" },
      ],
    }),
  });

  await assert.rejects(workspaceResolve(ctxWith(exec)), /w2, w5/);
});

test("inside Herdr, incomplete socket identity refuses without any CLI call", async () => {
  const { exec, calls } = fakeExec({});

  await assert.rejects(
    workspaceResolve(ctxWith(exec, { HERDR_ENV: "1", HERDR_WORKSPACE_ID: "w8" })),
    /socket identity is incomplete/,
  );
  assert.equal(calls.length, 0);
});

test("inside Herdr, an unreadable injected workspace refuses instead of label search", async () => {
  const { exec, calls } = fakeExec({
    "workspace get w8": {
      stdout: "",
      stderr: JSON.stringify({
        error: { code: "workspace_not_found", message: "workspace w8 not found" },
      }),
      code: 1,
    },
  });

  await assert.rejects(
    workspaceResolve(
      ctxWith(exec, {
        HERDR_ENV: "1",
        HERDR_WORKSPACE_ID: "w8",
        HERDR_TAB_ID: "w8:t2",
        HERDR_PANE_ID: "w8:p2",
      }),
    ),
    /could not be read live/,
  );
  assert.equal(calls.length, 1, "must not fall back to workspace list");
});

test("inside Herdr, a pane disagreeing about its workspace refuses", async () => {
  const { exec } = fakeExec({
    "workspace get w8": ok({ workspace: { workspace_id: "w8", label: "lif-agents" } }),
    "tab get w8:t2": ok({ tab: { tab_id: "w8:t2", workspace_id: "w8" } }),
    "pane get w8:p2": ok({ pane: { pane_id: "w8:p2", tab_id: "w6:t1", workspace_id: "w6" } }),
  });

  await assert.rejects(
    workspaceResolve(
      ctxWith(exec, {
        HERDR_ENV: "1",
        HERDR_WORKSPACE_ID: "w8",
        HERDR_TAB_ID: "w8:t2",
        HERDR_PANE_ID: "w8:p2",
      }),
    ),
    /pane w8:p2 belongs to workspace w6/,
  );
});

test("inside Herdr, agreeing identity resolves live", async () => {
  const { exec } = fakeExec({
    "workspace get w8": ok({ workspace: { workspace_id: "w8", label: "lif-agents" } }),
    "tab get w8:t2": ok({ tab: { tab_id: "w8:t2", workspace_id: "w8" } }),
    "pane get w8:p2": ok({ pane: { pane_id: "w8:p2", tab_id: "w8:t2", workspace_id: "w8" } }),
  });

  const resolved = await workspaceResolve(
    ctxWith(exec, {
      HERDR_ENV: "1",
      HERDR_WORKSPACE_ID: "w8",
      HERDR_TAB_ID: "w8:t2",
      HERDR_PANE_ID: "w8:p2",
    }),
  );

  assert.deepEqual(
    { workspaceId: resolved.workspaceId, source: resolved.source },
    { workspaceId: "w8", source: "identity" },
  );
});

test("tabCreate parses ids from the response and never focuses", async () => {
  const { exec, calls } = fakeExec({
    "tab create": ok({
      type: "tab_created",
      tab: { agent_status: "unknown", label: "task-1", tab_id: "w8:t9", workspace_id: "w8" },
      root_pane: { pane_id: "w8:p9", tab_id: "w8:t9", workspace_id: "w8", cwd: "D:\\wt" },
    }),
  });

  const created = await tabCreate(ctxWith(exec), {
    workspaceId: "w8",
    cwd: "D:\\wt",
    label: "task-1",
  });

  assert.deepEqual(
    { tabId: created.tabId, paneId: created.paneId },
    { tabId: "w8:t9", paneId: "w8:p9" },
  );
  const args = calls[0]?.args ?? [];
  assert.deepEqual(args, [
    "--session",
    "default",
    "tab",
    "create",
    "--workspace",
    "w8",
    "--cwd",
    "D:\\wt",
    "--label",
    "task-1",
    "--no-focus",
  ]);
});

test("tabCreate refuses a response missing the root pane id", async () => {
  const { exec } = fakeExec({ "tab create": ok({ tab: { tab_id: "w8:t9" } }) });

  await assert.rejects(tabCreate(ctxWith(exec), { workspaceId: "w8" }), /pane id/);
});

test("agentStart passes harness args after the -- separator", async () => {
  const { exec, calls } = fakeExec({ "agent start task-1": ok({ agent: {} }) });

  await agentStart(ctxWith(exec), {
    paneId: "w8:p9",
    name: "task-1",
    kind: "claude",
    args: ["--dangerously-skip-permissions", "read the brief"],
  });

  assert.deepEqual(calls[0]?.args.slice(2), [
    "agent",
    "start",
    "task-1",
    "--kind",
    "claude",
    "--pane",
    "w8:p9",
    "--",
    "--dangerously-skip-permissions",
    "read the brief",
  ]);
});

test("agentGet maps herdr statuses and falls back to unknown", async () => {
  const { exec } = fakeExec({
    "agent get w8:p1": ok({ agent: { agent_status: "working", pane_id: "w8:p1" } }),
    "agent get w8:p2": ok({ agent: { agent_status: "reticulating", pane_id: "w8:p2" } }),
  });
  const ctx = ctxWith(exec);

  assert.equal((await agentGet(ctx, "w8:p1")).state, "working");
  assert.equal((await agentGet(ctx, "w8:p2")).state, "unknown");
});

test("paneRead requests at least 200 lines and trims locally", async () => {
  const body = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join("\r\n");
  const { exec, calls } = fakeExec({ "pane read w8:p1": { stdout: body, stderr: "", code: 0 } });

  const text = await paneRead(ctxWith(exec), "w8:p1", 5);

  const args = calls[0]?.args ?? [];
  assert.equal(args[args.indexOf("--lines") + 1], "200");
  assert.deepEqual(text.split("\n"), ["line 36", "line 37", "line 38", "line 39", "line 40"]);
});

test("failures surface the stderr error JSON on a typed error", async () => {
  const { exec } = fakeExec({
    "tab close w8:t9": {
      stdout: "",
      stderr: JSON.stringify({ error: { code: "tab_not_found", message: "tab w8:t9 not found" } }),
      code: 1,
    },
  });

  await assert.rejects(tabClose(ctxWith(exec), "w8:t9"), (error: unknown) => {
    assert.ok(error instanceof HerdrError);
    assert.equal(error.errorCode, "tab_not_found");
    assert.equal(error.exitCode, 1);
    assert.match(error.message, /tab w8:t9 not found/);
    assert.ok(error.stderr.includes("tab_not_found"));
    return true;
  });
});

test("a CLI syntax error (exit 2, non-JSON stderr) still throws a HerdrError", async () => {
  const { exec } = fakeExec({
    "agent get w8:p1": { stdout: "", stderr: "error: unexpected argument", code: 2 },
  });

  await assert.rejects(agentGet(ctxWith(exec), "w8:p1"), (error: unknown) => {
    assert.ok(error instanceof HerdrError);
    assert.equal(error.exitCode, 2);
    assert.equal(error.errorCode, undefined);
    return true;
  });
});
