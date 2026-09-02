// Orca backend: repos from `orca repo list`, `orca worktree create` for the
// checkout, and the hub page as an Orca browser tab. Executable resolution
// follows the orca-cli skill's rules.
//
// `--agent claude` takes no extra flags, so a launch with a model or effort
// creates the worktree bare and then starts `claude --model … --effort …` in a
// new terminal there. Without either, one `--agent --prompt` call does it all.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { agentFlags, shellQuote } from "./backend.mts";
import type { Backend, FocusTarget, LaunchResult, LaunchSpec, Repo } from "./backend.mts";

export function buildOrcaArgs(spec: LaunchSpec): string[][] {
  const create = ["worktree", "create", "--repo", `path:${spec.repoPath}`, "--name", spec.name, "--no-parent"];
  const flags = agentFlags(spec);
  if (!flags.length) {
    create.push("--agent", spec.agent, "--prompt", spec.prompt, "--json");
    if (spec.activate) create.push("--activate");
    return [create];
  }
  create.push("--json");
  const command = [spec.agent, ...flags, spec.prompt].map(shellQuote).join(" ");
  const terminal = ["terminal", "create", "--worktree", `path:${WORKTREE_PATH}`, "--command", command, "--json"];
  if (spec.activate) terminal.push("--focus");
  return [create, terminal];
}

/** Placeholder in the preview for the path `worktree create` will return. */
export const WORKTREE_PATH = "<worktree>";

export function resolveOrcaExecutable(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (p: string) => boolean = (p) => fs.existsSync(p),
): string {
  if (env.ORCA_CLI_COMMAND) return env.ORCA_CLI_COMMAND;
  if (env.ORCA_DEV_REPO_ROOT) return "orca-dev";
  const pathDirs = (env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const onPath = (name: string, skipDir: (dir: string) => boolean = () => false): string | null => {
    for (const dir of pathDirs) {
      if (skipDir(dir)) continue;
      const candidate = path.join(dir, name);
      if (exists(candidate)) return candidate;
    }
    return null;
  };
  if (platform === "linux") {
    const ide = onPath("orca-ide");
    if (ide) return ide;
    // /usr/bin/orca and /bin/orca on Linux are the GNOME screen reader, never the CLI.
    const orca = onPath("orca", (dir) => dir === "/usr/bin" || dir === "/bin");
    if (orca) return orca;
    throw new Error("no Orca CLI found: set ORCA_CLI_COMMAND or put orca-ide on PATH");
  }
  return "orca";
}

export function listOrcaRepos(orca: string): Repo[] {
  const out = execFileSync(orca, ["repo", "list", "--json"], { encoding: "utf8" });
  const parsed = JSON.parse(out) as { ok: boolean; result?: { repos: Repo[] }; error?: unknown };
  if (!parsed.ok || !parsed.result) throw new Error(`orca repo list failed: ${JSON.stringify(parsed.error)}`);
  return parsed.result.repos.map((r) => ({ displayName: r.displayName, path: r.path }));
}

function callOrca<T>(orca: string, args: string[]): T {
  const result = spawnSync(orca, args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw new Error(`could not run orca: ${result.error.message}`);
  let parsed: { ok?: boolean; error?: unknown; result?: T };
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(`orca ${args[0]} ${args[1]} gave no JSON (exit ${result.status}): ${result.stderr.slice(0, 400)}`);
  }
  if (!parsed.ok || parsed.result === undefined) throw new Error(`orca ${args[0]} ${args[1]} failed: ${JSON.stringify(parsed.error ?? parsed)}`);
  return parsed.result;
}

export function launchOrca(orca: string, spec: LaunchSpec): LaunchResult {
  const [create, terminal] = buildOrcaArgs(spec);
  const created = callOrca<{ worktree?: { id?: string; path?: string } }>(orca, create as string[]);
  const launched = { worktreeId: created.worktree?.id ?? null, worktreePath: created.worktree?.path ?? null };
  if (terminal) {
    if (!launched.worktreePath) throw new Error("orca worktree create returned no path to start the agent in");
    callOrca(orca, terminal.map((a) => a.replace(WORKTREE_PATH, launched.worktreePath as string)));
  }
  return launched;
}

interface OrcaTerminal {
  handle: string;
  worktreeId: string;
  worktreePath: string;
  agentIdentity: unknown;
}

/** Handles are runtime-scoped, so look the terminal up fresh on every focus. */
export function pickOrcaTerminal(terminals: OrcaTerminal[], target: FocusTarget): OrcaTerminal | undefined {
  const mine = terminals.filter((t) => (target.worktreeId && t.worktreeId === target.worktreeId) || (target.worktreePath && t.worktreePath === target.worktreePath));
  return mine.find((t) => t.agentIdentity) ?? mine[0];
}

export function focusOrca(orca: string, target: FocusTarget): void {
  const out = execFileSync(orca, ["terminal", "list", "--json"], { encoding: "utf8" });
  const parsed = JSON.parse(out) as { ok: boolean; result?: { terminals: OrcaTerminal[] }; error?: unknown };
  if (!parsed.ok || !parsed.result) throw new Error(`orca terminal list failed: ${JSON.stringify(parsed.error)}`);
  const term = pickOrcaTerminal(parsed.result.terminals, target);
  if (!term) throw new Error(`no open terminal for ${target.worktreePath ?? target.worktreeId}`);
  const sw = spawnSync(orca, ["terminal", "switch", "--terminal", term.handle, "--json"], { encoding: "utf8" });
  if (sw.status !== 0) throw new Error(`orca terminal switch failed: ${sw.stdout}${sw.stderr}`);
}

export function createOrcaBackend(env: NodeJS.ProcessEnv): Backend {
  const orca = resolveOrcaExecutable(env);
  return {
    name: "orca",
    executable: orca,
    repos: () => listOrcaRepos(orca),
    preview: (spec) => buildOrcaArgs(spec).map((args) => [orca, ...args]),
    launch: (spec) => launchOrca(orca, spec),
    openPage(url, env) {
      const args = ["tab", "create", "--url", url, "--json"];
      if (env.LIF_NOTES_DIR) args.push("--worktree", `path:${env.LIF_NOTES_DIR}`);
      const result = spawnSync(orca, args, { encoding: "utf8" });
      if (result.status !== 0) throw new Error(`orca tab create failed: ${result.stdout}${result.stderr}`);
    },
    focus: (target) => focusOrca(orca, target),
  };
}
