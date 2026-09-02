import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { buildHerdrCommands, herdrAgentName, listHerdrRepos } from "./herdr.mts";

test("buildHerdrCommands creates the worktree, starts the agent in its root pane, then prompts", () => {
  const cmds = buildHerdrCommands({ repoPath: "/r", name: "fix-bug-0905", agent: "claude", prompt: "p q", activate: true });
  assert.deepEqual(cmds, [
    ["worktree", "create", "--cwd", "/r", "--branch", "fix-bug-0905", "--label", "fix-bug-0905", "--focus"],
    ["agent", "start", "fix-bug-0905", "--kind", "claude", "--pane", "<pane>"],
    ["agent", "prompt", "fix-bug-0905", "p q"],
  ]);
  const quiet = buildHerdrCommands({ repoPath: "/r", name: "n", agent: "claude", prompt: "p", activate: false }, "w1:p3");
  assert.ok(quiet[0]?.includes("--no-focus"));
  assert.equal(quiet[1]?.at(-1), "w1:p3");
  const flagged = buildHerdrCommands({ repoPath: "/r", name: "n", agent: "claude", model: "opus", effort: "max", prompt: "p", activate: false }, "w1:p3");
  assert.deepEqual(flagged[1], ["agent", "start", "n", "--kind", "claude", "--pane", "w1:p3", "--", "--model", "opus", "--effort", "max"]);
});

test("herdrAgentName fits Herdr's name rule", () => {
  assert.equal(herdrAgentName("Fix Bug/0905"), "fix-bug-0905");
  assert.equal(herdrAgentName("123"), "agent");
  assert.equal(herdrAgentName("a".repeat(40)).length, 32);
});

test("listHerdrRepos returns the git checkouts under the personal folder", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hub-herdr-"));
  fs.mkdirSync(path.join(root, "zeta", ".git"), { recursive: true });
  fs.mkdirSync(path.join(root, "alpha", ".git"), { recursive: true });
  fs.mkdirSync(path.join(root, "notes"));
  assert.deepEqual(listHerdrRepos({}, root), [
    { displayName: "alpha", path: path.join(root, "alpha") },
    { displayName: "zeta", path: path.join(root, "zeta") },
  ]);
  assert.throws(() => listHerdrRepos({}), /LIF_GITHUB_DIR/);
});
