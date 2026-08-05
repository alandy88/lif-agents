// The harvest path (PRD §5.6): inspect, land, abandon.
//
// Two rules shape everything here:
//  - Git is the record, the pane is supporting evidence. Every failure to reach
//    Herdr degrades to a warning; a failure to reach Git stops the command.
//  - Present, don't decide. `collect` never lands, never removes, never forces.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { defaultGitExec, git } from "./git.mts";
import type { GitExec } from "./git.mts";
import { agentGet, defaultExec as defaultHerdrExec, paneRead, tabClose } from "./herdr.mts";
import type { AgentState, HerdrCtx, HerdrExec } from "./herdr.mts";
import { configDir, getTask, loadProjects, resolveProject, updateTask } from "./store.mts";
import type { DispatchTask, ProjectEntry } from "./types.mts";

const PANE_TAIL_LINES = 60;

export interface CollectDeps {
  /** Config dir holding tasks.json, projects.json and notes/. */
  dir: string;
  gitExec: GitExec;
  herdrExec: HerdrExec;
  /** `gh` shares git's exec shape; separate so a missing gh can't fail a land. */
  ghExec: GitExec;
  env?: NodeJS.ProcessEnv;
  out: (line: string) => void;
  now?: () => string;
}

export function defaultDeps(overrides: Partial<CollectDeps> = {}): CollectDeps {
  return {
    dir: configDir(),
    gitExec: defaultGitExec,
    herdrExec: defaultHerdrExec,
    ghExec: (args, cwd) => defaultGitExec(args, cwd),
    out: (line) => console.log(line),
    ...overrides,
  };
}

function ctxFor(task: DispatchTask, deps: CollectDeps): HerdrCtx {
  return { session: task.herdr.session, exec: deps.herdrExec, env: deps.env ?? process.env };
}

function stamp(deps: CollectDeps): string {
  return (deps.now ?? (() => new Date().toISOString()))();
}

/** The project entry, or undefined when the config or the project is gone —
 *  a missing config must not block reading Git truth. */
export function projectFor(task: DispatchTask, dir: string): ProjectEntry | undefined {
  try {
    return resolveProject(loadProjects(dir), task.project);
  } catch {
    return undefined;
  }
}

export function baseBranchFor(task: DispatchTask, dir: string): string {
  return projectFor(task, dir)?.baseBranch ?? "main";
}

export interface GitTruth {
  missing: boolean;
  dirty: boolean;
  status: string;
  commits: string[];
  diffstat: string;
}

export async function gitTruth(
  task: DispatchTask,
  base: string,
  exec: GitExec,
  withDiffstat = true,
): Promise<GitTruth> {
  if (!fs.existsSync(task.worktree)) {
    return { missing: true, dirty: false, status: "", commits: [], diffstat: "" };
  }
  const status = await git(["status", "--porcelain"], task.worktree, exec);
  const log = await git(["log", `${base}..HEAD`, "--oneline"], task.worktree, exec);
  const diffstat = withDiffstat
    ? await git(["diff", "--stat", `${base}..HEAD`], task.worktree, exec)
    : "";
  return {
    missing: false,
    dirty: status.trim().length > 0,
    status,
    commits: log.split("\n").filter((line) => line.trim().length > 0),
    diffstat,
  };
}

export interface CollectReport {
  ok: boolean;
  agentState: AgentState | "gone";
  truth: GitTruth;
  paneTail: string | undefined;
  notePath?: string;
  /** The one-line reading a human should act on. */
  verdict: string;
}

export async function collect(taskId: string, deps: CollectDeps): Promise<CollectReport> {
  const task = getTask(taskId, deps.dir);
  const base = baseBranchFor(task, deps.dir);
  const say = deps.out;

  // 1. Liveness. A dead pane is not an error: the pane was always disposable.
  let agentState: AgentState | "gone";
  try {
    agentState = (await agentGet(ctxFor(task, deps), task.herdr.paneId)).state;
  } catch {
    agentState = "gone";
  }

  // 2. Git truth.
  const truth = await gitTruth(task, base, deps.gitExec);

  say(`task ${task.id}  project ${task.project}  harness ${task.harness}  mode ${task.mode}`);
  say(`branch ${task.branch}  base ${base}`);

  if (truth.missing) {
    say(`worktree ${task.worktree} no longer exists on disk`);
    say(`run: collect.mts abandon ${task.id}   (to clear the branch, tab and record)`);
    return { ok: false, agentState, truth, paneTail: undefined, verdict: "worktree missing" };
  }

  // 3. Pane tail — evidence only, and shown before any label is applied.
  let paneTail: string | undefined;
  try {
    paneTail = await paneRead(ctxFor(task, deps), task.herdr.paneId, PANE_TAIL_LINES);
  } catch {
    paneTail = undefined;
  }

  // 4. Present.
  say("");
  say(`agent state: ${agentState}${agentState === "blocked" ? "   !! BLOCKED — a permission dialog is waiting on you" : ""}`);
  if (agentState === "idle") {
    say("  (herdr `idle` is not proof of completion — it reads idle during a long foreground tool call)");
  }
  say(`worktree: ${task.worktree}  ${truth.dirty ? "DIRTY (uncommitted changes)" : "clean"}`);
  if (truth.dirty) say(truth.status);
  say(`commits on ${base}..HEAD: ${truth.commits.length}`);
  for (const line of truth.commits) say(`  ${line}`);
  if (truth.diffstat) {
    say("diffstat:");
    say(truth.diffstat);
  }
  say("");
  say(`pane tail (${task.herdr.paneId}):`);
  say(paneTail ?? "  (pane unreadable — gone, or the herdr server restarted)");
  say("");

  const nothing = !truth.dirty && truth.commits.length === 0;
  let verdict: string;
  if (nothing && agentState === "gone") {
    verdict = "nothing produced — pane is gone and the worktree is clean with no commits";
  } else if (nothing && (agentState === "idle" || agentState === "unknown")) {
    // Identical to "nothing produced" on the Git axis, opposite correct action.
    verdict =
      "nothing produced YET — the agent may be WAITING ON A QUESTION. " +
      "Read the pane tail above before concluding; the answer belongs in the pane, not here.";
  } else if (nothing && agentState === "working") {
    verdict = "still working — nothing committed yet, but herdr reports live activity";
  } else if (nothing) {
    verdict = `nothing produced — clean worktree, no commits (agent ${agentState})`;
  } else {
    verdict = `work present: ${truth.commits.length} commit(s)${truth.dirty ? " plus uncommitted changes" : ""}`;
  }
  say(`verdict: ${verdict}`);

  const notePath = writeNoteStub(task, base, truth, deps);
  say(`note stub: ${notePath}`);
  say(`next: collect.mts land ${task.id}   |   collect.mts abandon ${task.id}`);

  const collectedAt = stamp(deps);
  updateTask(
    task.id,
    {
      state: "collected",
      collectedAt,
      result: { ...task.result, summary: verdict, notePath },
    },
    deps.dir,
  );

  return { ok: true, agentState, truth, paneTail, notePath, verdict };
}

function writeNoteStub(
  task: DispatchTask,
  base: string,
  truth: GitTruth,
  deps: CollectDeps,
): string {
  const file = path.join(deps.dir, "notes", `${task.id}.md`);
  const body = [
    `# ${task.id}`,
    "",
    `- project: ${task.project}`,
    `- harness: ${task.harness}${task.model ? ` (${task.model}${task.effort ? `, ${task.effort}` : ""})` : ""}`,
    `- mode: ${task.mode}`,
    `- branch: ${task.branch} (base ${base})`,
    `- worktree: ${task.worktree}`,
    `- collected: ${stamp(deps)}`,
    "",
    "## Commits",
    "",
    truth.commits.length ? truth.commits.map((c) => `- ${c}`).join("\n") : "_none_",
    "",
    "## Diffstat",
    "",
    truth.diffstat ? "```\n" + truth.diffstat + "\n```" : "_none_",
    "",
    "## Summary",
    "",
    "_fill in, then file into lif-notes_",
    "",
  ].join("\n");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, "utf8");
  return file;
}

export interface LandReport {
  ok: boolean;
  reasons: string[];
  pushed: boolean;
  prUrl?: string;
}

export async function land(taskId: string, deps: CollectDeps): Promise<LandReport> {
  const task = getTask(taskId, deps.dir);
  const base = baseBranchFor(task, deps.dir);
  const say = deps.out;

  const truth = await gitTruth(task, base, deps.gitExec);
  if (truth.missing) {
    say(`worktree ${task.worktree} no longer exists — nothing to land.`);
    return { ok: false, reasons: ["worktree missing"], pushed: false };
  }

  if (task.mode === "local") {
    if (truth.commits.length === 0) {
      say(`refusing to land ${task.id}: no commits on ${base}..HEAD.`);
      return { ok: false, reasons: ["no commits"], pushed: false };
    }
    say(`branch ${task.branch} is ready with ${truth.commits.length} commit(s) on top of ${base}.`);
    say(`worktree: ${task.worktree}`);
    if (truth.dirty) say("note: the worktree still has uncommitted changes; they are NOT on the branch.");
    say("worktree kept on purpose. After you merge the branch, run");
    say(`  collect.mts abandon ${task.id}   (it will see no unlanded work and clean up)`);
    updateTask(task.id, { state: "landed" }, deps.dir);
    return { ok: true, reasons: [], pushed: false };
  }

  // Behind-base is detected and reported, never auto-rebased.
  const behind = Number(
    await git(["rev-list", "--count", `${task.branch}..${base}`], task.worktree, deps.gitExec),
  );
  if (behind > 0) {
    say(
      `refusing to land ${task.id}: ${task.branch} is ${behind} commit(s) behind ${base} ` +
        `(${truth.commits.length} ahead). Rebase or merge it yourself, then land again.`,
    );
    return { ok: false, reasons: [`behind ${base} by ${behind}`], pushed: false };
  }

  await git(["push", "-u", "origin", task.branch], task.worktree, deps.gitExec);
  say(`pushed ${task.branch} to origin.`);

  let prUrl: string | undefined;
  const pr = await deps.ghExec(
    ["pr", "create", "--head", task.branch, "--title", task.id, "--fill-first"],
    task.worktree,
  );
  if (pr.code === 0) {
    prUrl = /https:\/\/\S+/.exec(pr.stdout)?.[0];
    say(`PR: ${prUrl ?? pr.stdout.trim()}`);
  } else {
    // gh may simply not be installed. The push already happened, so the land
    // stands; only the PR step is manual.
    say(`gh pr create failed: ${pr.stderr.trim() || pr.stdout.trim() || `exit ${pr.code}`}`);
    say(`branch ${task.branch} is pushed. Open the PR by hand:`);
    say(`  gh pr create --head ${task.branch} --fill-first`);
  }

  updateTask(
    task.id,
    { state: "landed", result: { ...task.result, summary: task.result?.summary ?? "landed", ...(prUrl ? { prUrl } : {}) } },
    deps.dir,
  );
  return { ok: true, reasons: [], pushed: true, ...(prUrl ? { prUrl } : {}) };
}

export interface AbandonReport {
  ok: boolean;
  reasons: string[];
  warnings: string[];
}

export async function abandon(
  taskId: string,
  opts: { discard: boolean },
  deps: CollectDeps,
): Promise<AbandonReport> {
  const task = getTask(taskId, deps.dir);
  const base = baseBranchFor(task, deps.dir);
  const project = projectFor(task, deps.dir);
  const say = deps.out;
  const warnings: string[] = [];

  // Read Git state first — a husk tab is closed only after the record is read.
  const truth = await gitTruth(task, base, deps.gitExec, false);
  const unlanded = truth.commits.length > 0 && task.state !== "landed";

  if ((truth.dirty || unlanded) && !opts.discard) {
    const reasons = [
      ...(truth.dirty ? ["worktree has uncommitted changes"] : []),
      ...(unlanded ? [`${truth.commits.length} unlanded commit(s) on ${base}..HEAD`] : []),
    ];
    say(`refusing to abandon ${task.id}: ${reasons.join("; ")}.`);
    say(`land it first, or re-run with --discard to throw the work away.`);
    return { ok: false, reasons, warnings };
  }

  if (!project) {
    say(`no project entry for ${task.project}; cannot run worktree removal from the primary checkout.`);
    return { ok: false, reasons: ["unknown project"], warnings };
  }

  if (!truth.missing) {
    const args = ["-C", project.path, "worktree", "remove", task.worktree];
    if (opts.discard) args.push("--force");
    await git(args, undefined, deps.gitExec);
    say(`removed worktree ${task.worktree}`);
  } else {
    say(`worktree ${task.worktree} already gone; pruning metadata only.`);
  }

  await git(["-C", project.path, "worktree", "prune"], undefined, deps.gitExec);

  try {
    await git(
      ["-C", project.path, "branch", opts.discard ? "-D" : "-d", task.branch],
      undefined,
      deps.gitExec,
    );
    say(`deleted branch ${task.branch}`);
  } catch (error) {
    // Unmerged branches are a warning: the worktree is already gone and the
    // record is closing either way.
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`branch ${task.branch} not deleted: ${message}`);
    say(`warning: ${warnings[warnings.length - 1]}`);
  }

  try {
    await tabClose(ctxFor(task, deps), task.herdr.tabId);
    say(`closed herdr tab ${task.herdr.tabId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`tab ${task.herdr.tabId} not closed: ${message}`);
    say(`warning: ${warnings[warnings.length - 1]}`);
  }

  updateTask(task.id, { state: "abandoned" }, deps.dir);
  say(`task ${task.id} abandoned.`);
  return { ok: true, reasons: [], warnings };
}

const USAGE = `usage:
  collect.mts <task-id>                    inspect: agent state, git truth, pane tail
  collect.mts land <task-id>               push/PR (mode pr) or report the ready branch (mode local)
  collect.mts abandon <task-id> [--discard]  remove worktree, branch, tab`;

export async function main(argv: string[], deps: CollectDeps = defaultDeps()): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    options: { discard: { type: "boolean", default: false } },
    allowPositionals: true,
  });

  const [first, second] = positionals;
  if (!first) {
    deps.out(USAGE);
    return 2;
  }

  if (first === "land" || first === "abandon") {
    if (!second) {
      deps.out(USAGE);
      return 2;
    }
    const report =
      first === "land"
        ? await land(second, deps)
        : await abandon(second, { discard: values.discard === true }, deps);
    return report.ok ? 0 : 1;
  }

  return (await collect(first, deps)).ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
