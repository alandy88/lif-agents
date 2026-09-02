// The seam between the hub and the tool that owns worktrees and terminals.
// A backend lists repos, starts an agent in a fresh worktree, and opens the
// hub page. Everything else in the hub is backend-blind.

export interface Repo {
  displayName: string;
  path: string;
}

export interface LaunchSpec {
  repoPath: string;
  name: string;
  agent: string;
  model?: string;
  effort?: string;
  prompt: string;
  activate: boolean;
}

/** `claude --model X --effort Y`: the flags an agent needs beyond its name. */
export function agentFlags(spec: LaunchSpec): string[] {
  const flags: string[] = [];
  if (spec.model) flags.push("--model", spec.model);
  if (spec.effort) flags.push("--effort", spec.effort);
  return flags;
}

export function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export interface LaunchResult {
  worktreeId: string | null;
  worktreePath: string | null;
}

export type BackendName = "orca" | "herdr";

export interface FocusTarget {
  worktreeId: string | null;
  worktreePath: string | null;
}

export interface Backend {
  name: BackendName;
  executable: string;
  repos(): Repo[];
  /** The argv lists `launch` would run, in order. Used by `--dry-run`. */
  preview(spec: LaunchSpec): string[][];
  launch(spec: LaunchSpec): LaunchResult;
  /** Show the hub page: a browser tab inside the tool, or the desktop browser. */
  openPage(url: string, env: NodeJS.ProcessEnv): void;
  /** Bring that worktree's agent terminal to the front of the tool's window. */
  focus(target: FocusTarget): void;
}

/** `<title>-<hhmm>` keeps repeated titles from colliding in one day. */
export function worktreeName(title: string, now: Date = new Date()): string {
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${title}-${hh}${mm}`;
}

export function backendName(env: NodeJS.ProcessEnv, override?: string): BackendName {
  const raw = override ?? env.LIF_HUB_BACKEND;
  if (raw === "orca" || raw === "herdr") return raw;
  if (raw) throw new Error(`unknown backend "${raw}": use orca or herdr`);
  return env.HERDR_ENV === "1" ? "herdr" : "orca";
}
