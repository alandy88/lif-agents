// The dispatch entry point (PRD §5, M1): resolve a project, cut a disposable
// worktree, assert isolation, then open a Herdr tab and launch an agent in it.
//
// Everything real lives in runDispatch(), which takes its git and herdr exec
// seams by injection; the CLI at the bottom is only argument parsing.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

import { parseContractMode, renderBrief } from "./brief.mts";
import { git } from "./git.mts";
import type { GitExec } from "./git.mts";
import { launchArgs, resolveAdapter } from "./harness.mts";
import { agentStart, tabCreate, workspaceResolve } from "./herdr.mts";
import type { HerdrCtx, HerdrExec } from "./herdr.mts";
import { addTask, configDir as defaultConfigDir, loadProjects, newTaskId, resolveProject } from "./store.mts";
import type { DispatchTask, Effort, Harness, Mode } from "./types.mts";

const HARNESSES: readonly Harness[] = ["claude", "codex", "grok", "pi", "opencode"];
const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh"];
const MODES: readonly Mode[] = ["pr", "local"];

export interface DispatchOptions {
  project: string;
  /** The {TASK} hole. Mutually exclusive with briefPath; exactly one required. */
  task?: string | undefined;
  /** A hand-written brief whose contract line must agree with `mode`. */
  briefPath?: string | undefined;
  harness?: string | undefined;
  model?: string | undefined;
  effort?: string | undefined;
  mode?: string | undefined;
}

export interface DispatchDeps {
  configDir?: string;
  gitExec?: GitExec;
  herdrExec?: HerdrExec;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  log?: (line: string) => void;
}

export interface DispatchResult {
  task: DispatchTask;
  briefText: string;
}

function oneOf<T extends string>(
  value: string,
  allowed: readonly T[],
  what: string,
): T {
  const hit = allowed.find((a) => a === value);
  if (hit === undefined) {
    throw new Error(`Invalid ${what} "${value}". Expected one of: ${allowed.join(", ")}`);
  }
  return hit;
}

/** Herdr agent names must match [a-z][a-z0-9_-]{0,31}. */
export function agentName(taskId: string): string {
  const mapped = taskId.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const prefixed = /^[a-z]/.test(mapped) ? mapped : `t-${mapped}`;
  return prefixed.slice(0, 32);
}

function samePath(a: string, b: string): boolean {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

export async function runDispatch(
  options: DispatchOptions,
  deps: DispatchDeps = {},
): Promise<DispatchResult> {
  const dir = deps.configDir ?? defaultConfigDir();
  const log = deps.log ?? ((line: string) => console.log(line));
  const now = deps.now ?? (() => new Date());

  const { task: taskText, briefPath: briefFile } = options;
  if ((taskText === undefined) === (briefFile === undefined)) {
    throw new Error("Pass exactly one of --task or --brief.");
  }

  // Step 1: everything that can refuse, refuses here — before a worktree,
  // a tab or a task record exists.
  const config = loadProjects(dir);
  const entry = resolveProject(config, options.project);
  const harness = oneOf(options.harness ?? entry.harness ?? "claude", HARNESSES, "harness");
  const adapter = resolveAdapter(harness);
  const mode = oneOf(options.mode ?? "local", MODES, "mode");
  const effort = options.effort === undefined ? undefined : oneOf(options.effort, EFFORTS, "effort");
  const baseBranch = entry.baseBranch ?? "main";

  // Step 2
  const slugSource = taskText ?? path.basename(briefFile ?? "", ".md");
  const id = newTaskId(options.project, slugSource);
  const branch = `dispatch/${id}`;
  const scratchRoot = config.scratchRoot ?? path.join(os.homedir(), ".lif-worktrees");
  const worktree = path.join(scratchRoot, id);

  // Step 3: surface git's own words. `worktree add` most often fails because the
  // branch is checked out elsewhere or stale metadata is present (PRD §5.6).
  try {
    await git(["-C", entry.path, "worktree", "add", worktree, "-b", branch, baseBranch], undefined, deps.gitExec);
  } catch (cause) {
    throw new Error(
      `Failed to create worktree ${worktree} from ${entry.path}: ` +
        `${cause instanceof Error ? cause.message : String(cause)}\n` +
        "If this names a stale worktree or an already-checked-out branch, run " +
        `\`git -C ${entry.path} worktree prune\` and retry. Never retry with --force.`,
    );
  }

  // Step 4: isolation assertion, belt one (PRD §5.4). Nothing is removed on
  // failure — a wrong toplevel here means our model of the repo is wrong.
  const worktreeTop = await git(["rev-parse", "--show-toplevel"], worktree, deps.gitExec);
  const primaryTop = await git(["-C", entry.path, "rev-parse", "--show-toplevel"], undefined, deps.gitExec);
  if (!samePath(worktreeTop, worktree) || samePath(worktreeTop, primaryTop)) {
    throw new Error(
      "Refusing to dispatch: worktree isolation assertion failed. " +
        `Expected toplevel ${worktree}, got ${worktreeTop}; project primary toplevel is ${primaryTop}. ` +
        "Nothing was removed — inspect by hand.",
    );
  }

  // Step 5
  let briefText: string;
  let briefPath: string;
  if (taskText !== undefined) {
    briefText = renderBrief({ task: taskText, project: options.project, worktree, branch, mode, taskId: id });
    briefPath = path.join(dir, "briefs", `${id}.md`);
    fs.mkdirSync(path.dirname(briefPath), { recursive: true });
    fs.writeFileSync(briefPath, briefText, "utf8");
  } else {
    briefPath = path.resolve(briefFile ?? "");
    briefText = fs.readFileSync(briefPath, "utf8");
    const declared = parseContractMode(briefText);
    if (declared !== mode) {
      throw new Error(
        `Refusing to dispatch: ${briefPath} declares delivery contract mode=${declared ?? "(unreadable)"}, ` +
          `but --mode is ${mode}. Make them agree.`,
      );
    }
  }

  // Step 6
  const ctx: HerdrCtx = {
    session: config.session ?? "default",
    exec: deps.herdrExec,
    env: deps.env,
  };
  const workspace = await workspaceResolve(ctx);
  const tab = await tabCreate(ctx, { workspaceId: workspace.workspaceId, cwd: worktree, label: id });

  const task: DispatchTask = {
    id,
    project: options.project,
    harness,
    model: options.model,
    // Recorded even when the adapter's effortFlag() returned [] (PRD §5.1).
    effort,
    mode,
    worktree,
    branch,
    herdr: {
      session: ctx.session,
      workspaceId: workspace.workspaceId,
      tabId: tab.tabId,
      paneId: tab.paneId,
    },
    briefPath,
    state: "dispatched",
    createdAt: now().toISOString(),
  };

  // The brief rides as a one-line POINTER, not inline: herdr refuses to encode
  // multi-line text as an agent argument ("cannot be encoded safely for the
  // target shell", verified live 2026-08-05). The file is already on disk.
  const briefPointer = `Read the file ${briefPath} and follow it exactly; it is your complete task brief.`;

  try {
    await agentStart(ctx, {
      paneId: tab.paneId,
      name: agentName(id),
      kind: adapter.kind,
      args: [...launchArgs(adapter, { model: options.model, effort }), briefPointer],
    });
  } catch (cause) {
    // The worktree and the tab exist now. Dropping the record here is exactly
    // the orphaned-pane failure mode (PRD §5.6), so record first, then rethrow.
    addTask(task, dir);
    throw new Error(
      `Agent start failed for task ${id} (tab ${tab.tabId} and worktree ${worktree} were created and recorded): ` +
        `${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  addTask(task, dir);

  log(
    [
      `dispatched ${id}`,
      `  project  ${options.project} (${harness}${options.model ? `, ${options.model}` : ""}${effort ? `, effort ${effort}` : ""})`,
      `  worktree ${worktree}`,
      `  branch   ${branch} (from ${baseBranch})`,
      `  tab      ${tab.tabId} pane ${tab.paneId}`,
      `  brief    ${briefPath}`,
      `next: status  |  collect ${id}`,
    ].join("\n"),
  );

  return { task, briefText };
}

const USAGE = `usage: dispatch <project> --task "<text>" | --brief <path>
       [--harness H] [--model M] [--effort low|medium|high|xhigh] [--mode pr|local]`;

async function main(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      task: { type: "string" },
      brief: { type: "string" },
      harness: { type: "string" },
      model: { type: "string" },
      effort: { type: "string" },
      mode: { type: "string" },
    },
  });
  const project = positionals[0];
  if (project === undefined || positionals.length > 1) throw new Error(USAGE);

  await runDispatch({
    project,
    task: values.task,
    briefPath: values.brief,
    harness: values.harness,
    model: values.model,
    effort: values.effort,
    mode: values.mode,
  });
}

const entry = process.argv[1];
if (entry !== undefined && samePath(entry, import.meta.filename)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
