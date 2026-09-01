// Builds the `orca worktree create` invocation and resolves which orca
// executable to run, following the orca-cli skill's rules.

import fs from "node:fs";
import path from "node:path";

export interface LaunchSpec {
  repoPath: string;
  name: string;
  agent: string;
  prompt: string;
  activate: boolean;
}

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

/** `<title>-<hhmm>` keeps repeated titles from colliding in one day. */
export function worktreeName(title: string, now: Date = new Date()): string {
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${title}-${hh}${mm}`;
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
