// The one-shot fleet sweep (PRD §5.7): one line per open task, on demand, no
// daemon. Answers "which of the six tabs was doing what" without needing to
// already know a task id — the thing `collect <task-id>` structurally cannot do.

import { pathToFileURL } from "node:url";

import { baseBranchFor, defaultDeps, gitTruth } from "./collect.mts";
import type { CollectDeps } from "./collect.mts";
import { agentGet } from "./herdr.mts";
import type { AgentState } from "./herdr.mts";
import { loadTasks } from "./store.mts";
import type { DispatchTask } from "./types.mts";

export interface StatusLine {
  task: DispatchTask;
  agent: AgentState | "gone";
  worktree: "missing" | "broken" | "dirty" | "clean";
  unlanded: number;
}

/** Open = anything not yet landed or abandoned, so `collected` still shows. */
function isOpen(task: DispatchTask): boolean {
  return task.state !== "landed" && task.state !== "abandoned";
}

export async function sweep(deps: CollectDeps): Promise<StatusLine[]> {
  const tasks = loadTasks(deps.dir).tasks.filter(isOpen);
  const lines: StatusLine[] = [];

  // Sequential on purpose: N is 1-3, and interleaved herdr calls buy nothing.
  for (const task of tasks) {
    let agent: AgentState | "gone";
    try {
      agent = (
        await agentGet(
          { session: task.herdr.session, exec: deps.herdrExec, env: deps.env ?? process.env },
          task.herdr.paneId,
        )
      ).state;
    } catch {
      agent = "gone";
    }

    const truth = await gitTruth(task, baseBranchFor(task, deps.dir), deps.gitExec, false);
    lines.push({
      task,
      agent,
      worktree: truth.missing ? "missing" : truth.broken ? "broken" : truth.dirty ? "dirty" : "clean",
      unlanded: task.state === "landed" ? 0 : truth.commits.length,
    });
  }

  return lines;
}

export function formatLine(line: StatusLine): string {
  const { task } = line;
  const parts = [
    task.id,
    task.project,
    task.harness,
    task.state,
    `agent=${line.agent}`,
    `worktree=${line.worktree}`,
    `unlanded=${line.unlanded}`,
  ];
  if (line.agent === "blocked") parts.push("!! BLOCKED — permission dialog waiting on you");
  return parts.join("  ");
}

export async function main(deps: CollectDeps = defaultDeps()): Promise<number> {
  const lines = await sweep(deps);
  if (lines.length === 0) {
    deps.out("no open tasks");
    return 0;
  }
  for (const line of lines) deps.out(formatLine(line));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
