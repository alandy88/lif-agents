// Shared contracts for lif-dispatch. Every module imports from here and
// nothing here imports from anywhere: this file is the integration surface
// the PRD's modules were built against in parallel.
//
// `Effort` mirrors remote/src/lib/profiles.mts by value, not by import —
// local/ and remote/ share nothing but the repository (AGENTS.md).

export type Harness = "claude" | "codex" | "grok" | "pi" | "opencode";
export type Effort = "low" | "medium" | "high" | "xhigh";
export type Mode = "pr" | "local";
export type TaskState = "dispatched" | "collected" | "landed" | "abandoned";

export interface HerdrEndpoint {
  /** Named herdr session, or "default". Passed as a global `--session` flag. */
  session: string;
  workspaceId: string;
  tabId: string;
  paneId: string;
}

export interface DispatchTask {
  /** <project>-<slug>-<short-random> */
  id: string;
  project: string;
  harness: Harness;
  model?: string;
  /** Requested profile, recorded even when the harness has no effort flag. */
  effort?: Effort;
  mode: Mode;
  /** Absolute path of the disposable worktree. */
  worktree: string;
  branch: string;
  herdr: HerdrEndpoint;
  briefPath: string;
  state: TaskState;
  createdAt: string;
  collectedAt?: string;
  result?: { summary: string; prUrl?: string; notePath?: string };
}

export interface ProjectEntry {
  /** Absolute path to the primary checkout. */
  path: string;
  harness?: Harness;
  /** Base branch for task branches and `land` comparisons. Default: "main". */
  baseBranch?: string;
}

/** ~/.config/lif-dispatch/projects.json — machine-local, never committed. */
export interface ProjectsConfig {
  /** Where disposable worktrees are created. Default: ~/.lif-worktrees */
  scratchRoot?: string;
  /** Named herdr session to dispatch into. Default: "default". */
  session?: string;
  projects: Record<string, ProjectEntry>;
}
