import assert from "node:assert/strict";
import { test } from "node:test";

import { buildOrcaArgs, pickOrcaTerminal, resolveOrcaExecutable } from "./orca.mts";

test("buildOrcaArgs targets the repo by path and launches the agent with the prompt", () => {
  const args = buildOrcaArgs({ repoPath: "/r", name: "n", agent: "claude", prompt: "p q", activate: true });
  assert.deepEqual(args, [
    "worktree", "create", "--repo", "path:/r", "--name", "n", "--no-parent",
    "--agent", "claude", "--prompt", "p q", "--json", "--activate",
  ]);
  assert.ok(!buildOrcaArgs({ repoPath: "/r", name: "n", agent: "claude", prompt: "p", activate: false }).includes("--activate"));
});

test("resolveOrcaExecutable honours ORCA_CLI_COMMAND first", () => {
  assert.equal(resolveOrcaExecutable({ ORCA_CLI_COMMAND: "/x/orca" }, "linux", () => true), "/x/orca");
});

test("resolveOrcaExecutable on linux prefers orca-ide and refuses the GNOME screen reader", () => {
  const env = { PATH: "/usr/bin:/home/p/.config/orca/shim" };
  const has = (p: string) => p === "/usr/bin/orca" || p === "/home/p/.config/orca/shim/orca";
  assert.equal(resolveOrcaExecutable(env, "linux", has), "/home/p/.config/orca/shim/orca");
  assert.equal(resolveOrcaExecutable(env, "linux", (p) => p === "/usr/bin/orca-ide"), "/usr/bin/orca-ide");
  assert.throws(() => resolveOrcaExecutable(env, "linux", (p) => p === "/usr/bin/orca"), /no Orca CLI/);
});

test("resolveOrcaExecutable elsewhere is plain orca", () => {
  assert.equal(resolveOrcaExecutable({}, "darwin", () => false), "orca");
});

test("pickOrcaTerminal prefers the agent's terminal in the target worktree", () => {
  const terms = [
    { handle: "t1", worktreeId: "a::/a", worktreePath: "/a", agentIdentity: null },
    { handle: "t2", worktreeId: "b::/b", worktreePath: "/b", agentIdentity: null },
    { handle: "t3", worktreeId: "b::/b", worktreePath: "/b", agentIdentity: { kind: "claude" } },
  ];
  assert.equal(pickOrcaTerminal(terms, { worktreeId: "b::/b", worktreePath: null })?.handle, "t3");
  assert.equal(pickOrcaTerminal(terms, { worktreeId: null, worktreePath: "/a" })?.handle, "t1");
  assert.equal(pickOrcaTerminal(terms, { worktreeId: null, worktreePath: "/zzz" }), undefined);
});
