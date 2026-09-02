// Orca backend: repos from `orca repo list`, one `orca worktree create` that
// starts the agent with the prompt, and the hub page as an Orca browser tab.
// Executable resolution follows the orca-cli skill's rules.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { Backend, FocusTarget, LaunchResult, LaunchSpec, Repo } from "./backend.mts";

export function buildOrcaArgs(spec: LaunchSpec): string[] {
  const args = [
    "worktree",
    "create",
    "--repo",
    `path:${spec.repoPath}`,
    "--name",
    spec.name,
    "--no-parent",
    "--agent",
    spec.agent,
    "--prompt",
    spec.prompt,
    "--json",
  ];
  if (spec.activate) args.push("--activate");
  return args;
}

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

export function launchOrca(orca: string, spec: LaunchSpec): LaunchResult {
  const result = spawnSync(orca, buildOrcaArgs(spec), { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw new Error(`could not run orca: ${result.error.message}`);
  let parsed: { ok?: boolean; error?: unknown; result?: { worktree?: { id?: string; path?: string } } };
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(`orca worktree create gave no JSON (exit ${result.status}): ${result.stderr.slice(0, 400)}`);
  }
  if (!parsed.ok) throw new Error(`orca worktree create failed: ${JSON.stringify(parsed.error ?? parsed)}`);
  return { worktreeId: parsed.result?.worktree?.id ?? null, worktreePath: parsed.result?.worktree?.path ?? null };
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
    preview: (spec) => [[orca, ...buildOrcaArgs(spec)]],
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
