// The brief scaffold (PRD §5.3): the prompt handed to a dispatched agent,
// plus the machine-readable delivery contract line that dispatch.mts checks
// against its own --mode before launching.

import type { Mode } from "./types.mts";

export interface BriefInput {
  /** The {TASK} hole: what the human or main agent actually wants done. */
  task: string;
  project: string;
  /** Absolute path of the disposable worktree. */
  worktree: string;
  branch: string;
  mode: Mode;
  taskId: string;
}

const CONTRACT_PREFIX = "Delivery contract: mode=";

// Strict on the line's shape, tolerant of leading/trailing whitespace: a brief
// is a file a human may reformat, but a contract that parses loosely is a
// contract that silently disagrees with the recorded task.
const CONTRACT_LINE = /^[ \t]*Delivery contract: mode=([a-z]+)[ \t]*$/;

const MODES: readonly string[] = ["pr", "local"];

function definitionOfDone(mode: Mode): string {
  if (mode === "pr") {
    return [
      "- Commit your work on this branch.",
      "- Push the branch to the remote.",
      "- Open a pull request and report its URL.",
    ].join("\n");
  }
  return [
    "- Commit your work on this branch.",
    "- Stop there: do not push, do not open a pull request.",
    "- Report the commits you made.",
  ].join("\n");
}

export function renderBrief(input: BriefInput): string {
  const { task, project, worktree, branch, mode, taskId } = input;
  return `# Task ${taskId} — ${project}

${CONTRACT_PREFIX}${mode}

## Task

${task.trim()}

## Setup

1. Run \`git rev-parse --show-toplevel\` and verify it resolves to:
   ${worktree}
   If it does not, stop immediately and report a \`blocked\` note saying which
   toplevel you actually got. Do not \`cd\` elsewhere and retry.
2. You are on branch \`${branch}\`, an isolated worktree of ${project}. It is
   disposable — nothing else depends on its working tree.

## Rules

- Work only inside ${worktree}. Never touch the primary checkout of ${project}.
- Stay on \`${branch}\`; do not switch, rebase, or merge other branches.
- Do not amend or rewrite commits that were already on the branch when you started.
- If the task premise looks wrong or you are blocked, stop and say so. Do not guess.

## Definition of done

${definitionOfDone(mode)}
`;
}

/**
 * Read the delivery contract back out of a brief on disk. Returns undefined
 * when the line is absent, duplicated with disagreeing values, or names a mode
 * we don't have — every one of which the caller must treat as a refusal.
 */
export function parseContractMode(briefText: string): Mode | undefined {
  const found = new Set<string>();
  for (const line of briefText.split(/\r?\n/)) {
    const match = CONTRACT_LINE.exec(line);
    if (match?.[1] !== undefined) found.add(match[1]);
  }
  const [only] = [...found];
  if (found.size !== 1 || only === undefined || !MODES.includes(only)) return undefined;
  return only as Mode;
}
