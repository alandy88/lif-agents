// Herdr backend. Herdr keeps no repo registry, so repos are the git checkouts
// under $LIF_GITHUB_DIR/personal. A launch is three socket calls: create the
// worktree workspace, start the agent in its root pane, then prompt it.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { Backend, LaunchResult, LaunchSpec, Repo } from "./backend.mts";

export function listHerdrRepos(env: NodeJS.ProcessEnv, root?: string): Repo[] {
  const base = root ?? (env.LIF_GITHUB_DIR ? path.join(env.LIF_GITHUB_DIR, "personal") : undefined);
  if (!base) throw new Error("herdr backend needs LIF_GITHUB_DIR to find repos");
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(base, d.name, ".git")))
    .map((d) => ({ displayName: d.name, path: path.join(base, d.name) }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Herdr agent names must match `[a-z][a-z0-9_-]{0,31}`. */
export function herdrAgentName(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^[^a-z]+/, "");
  return (cleaned || "agent").slice(0, 32);
}

export function buildHerdrCommands(spec: LaunchSpec, paneId = "<pane>"): string[][] {
  const agentName = herdrAgentName(spec.name);
  return [
    ["worktree", "create", "--cwd", spec.repoPath, "--branch", spec.name, "--label", spec.name, spec.activate ? "--focus" : "--no-focus"],
    ["agent", "start", agentName, "--kind", spec.agent, "--pane", paneId],
    ["agent", "prompt", agentName, spec.prompt],
  ];
}

interface HerdrReply<T> {
  result?: T;
  error?: { code?: string; message?: string };
}

function callHerdr<T>(herdr: string, args: string[]): T {
  const result = spawnSync(herdr, args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw new Error(`could not run herdr: ${result.error.message}`);
  let parsed: HerdrReply<T>;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(`herdr ${args[0]} ${args[1]} gave no JSON (exit ${result.status}): ${result.stderr.slice(0, 400)}`);
  }
  if (parsed.error || parsed.result === undefined) {
    throw new Error(`herdr ${args[0]} ${args[1]} failed: ${parsed.error?.message ?? JSON.stringify(parsed)}`);
  }
  return parsed.result;
}

interface WorktreeCreated {
  workspace: { workspace_id: string };
  root_pane: { pane_id: string };
  worktree: { path: string };
}

export function launchHerdr(herdr: string, spec: LaunchSpec): LaunchResult {
  const [create, start, prompt] = buildHerdrCommands(spec);
  const created = callHerdr<WorktreeCreated>(herdr, create as string[]);
  const paneId = created.root_pane.pane_id;
  const startArgs = (start as string[]).map((a) => (a === "<pane>" ? paneId : a));
  callHerdr(herdr, startArgs);
  callHerdr(herdr, prompt as string[]);
  return { worktreeId: created.workspace.workspace_id, worktreePath: created.worktree.path };
}

export function createHerdrBackend(env: NodeJS.ProcessEnv): Backend {
  const herdr = env.HERDR_CLI_COMMAND ?? "herdr";
  return {
    name: "herdr",
    executable: herdr,
    repos: () => listHerdrRepos(env),
    preview: (spec) => buildHerdrCommands(spec).map((args) => [herdr, ...args]),
    launch: (spec) => launchHerdr(herdr, spec),
    openPage(url) {
      const opener = process.platform === "darwin" ? "open" : "xdg-open";
      const result = spawnSync(opener, [url], { encoding: "utf8", stdio: "ignore" });
      if (result.error) throw new Error(`could not run ${opener}: ${result.error.message}`);
    },
    focus(target) {
      if (!target.worktreeId) throw new Error("herdr focus needs the workspace id from the launch");
      callHerdr(herdr, ["workspace", "focus", target.worktreeId]);
    },
  };
}
