import assert from "node:assert/strict";
import { test } from "node:test";

import type { Hub } from "./hub.mts";
import { handle } from "./server.mts";

function fakeHub(): Hub & { launched: unknown[] } {
  const launched: unknown[] = [];
  return {
    launched,
    orca: "orca",
    profiles: {
      promptsFile: "", repoIndex: "", baseSection: "b", defaultRepo: "lif-notes", agent: "claude", classifierModel: "m",
      modes: { exec: { section: "s", describe: "do", domains: { coding: { section: "d", describe: "code" } } } },
    },
    repos: () => [{ displayName: "lif-notes", path: "/n" }],
    route: (message, overrides) => ({
      classification: { mode: overrides.mode ?? "exec", domain: overrides.domain ?? null, repo: overrides.repo ?? "lif-notes", title: "t-t" },
      prompt: `P:${message}`,
      spec: { repoPath: "/n", name: "t-t-0900", agent: "claude", prompt: `P:${message}`, activate: true },
    }),
    launch: (spec) => {
      launched.push(spec);
      return { worktreeId: "r::/n/wt", worktreePath: "/n/wt" };
    },
  };
}

const req = (over: Partial<Parameters<typeof handle>[1]>) => ({
  method: "GET", url: "/", origin: undefined, host: "127.0.0.1:47811", body: "", ...over,
});

test("GET / serves the page", () => {
  const r = handle(fakeHub(), req({}), () => "<html>hub</html>");
  assert.equal(r.status, 200);
  assert.equal(r.body, "<html>hub</html>");
});

test("GET /api/profiles flattens modes and lists repos", () => {
  const r = handle(fakeHub(), req({ url: "/api/profiles" }));
  const j = JSON.parse(r.body);
  assert.deepEqual(j.modes, { exec: { describe: "do", domains: { coding: "code" } } });
  assert.equal(j.repos[0].displayName, "lif-notes");
});

test("POST /api/route classifies without launching", () => {
  const hub = fakeHub();
  const r = handle(hub, req({ method: "POST", url: "/api/route", body: JSON.stringify({ message: "hi" }) }));
  const j = JSON.parse(r.body);
  assert.equal(r.status, 200);
  assert.equal(j.prompt, "P:hi");
  assert.equal(hub.launched.length, 0);
});

test("POST /api/launch routes with overrides and launches", () => {
  const hub = fakeHub();
  const r = handle(hub, req({ method: "POST", url: "/api/launch", body: JSON.stringify({ message: "hi", mode: "exec", domain: "coding", repo: "lif-notes" }) }));
  const j = JSON.parse(r.body);
  assert.equal(j.worktreePath, "/n/wt");
  assert.equal(j.classification.domain, "coding");
  assert.equal(hub.launched.length, 1);
});

test("POST refuses cross-origin callers and empty messages", () => {
  const hub = fakeHub();
  const cross = handle(hub, req({ method: "POST", url: "/api/launch", origin: "http://evil.example", body: JSON.stringify({ message: "x" }) }));
  assert.equal(cross.status, 403);
  const empty = handle(hub, req({ method: "POST", url: "/api/launch", body: "{}" }));
  assert.equal(empty.status, 400);
  assert.equal(hub.launched.length, 0);
});

test("hub errors surface as 500 with the message", () => {
  const hub = fakeHub();
  hub.route = () => { throw new Error("claude is down"); };
  const r = handle(hub, req({ method: "POST", url: "/api/route", body: JSON.stringify({ message: "x" }) }));
  assert.equal(r.status, 500);
  assert.match(JSON.parse(r.body).error, /claude is down/);
});
