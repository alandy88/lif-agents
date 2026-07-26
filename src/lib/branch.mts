// The agent branch — every git operation a run performs on its own branch, in
// one place. These were inline in both presets, and the presets had already
// drifted apart on the one decision that matters here: whether a failed push
// stops the run. Naming the operations (`push` vs `pushCheckpoint`) puts that
// decision in the call site's vocabulary instead of in a duplicated
// `if (exitCode !== 0)` block that reads the same in both places.
//
// Two seams, both structural rather than imported:
//
//   • host git arrives as an optional trailing `GitRunner` defaulting to
//     `hostGit` — the same shape as `DeliverDeps`, and what lets the
//     integration tier drive these functions against a real temp clone.
//   • the sandbox arrives as `ExecSandbox`, declared here rather than imported
//     from `../phases/context.mts`. `lib/` is Layer 1 and `phases/` is Layer 2;
//     nothing in `lib/` imports `phases/` today and this module is not the one
//     to start. Structural typing means `PhaseSandbox` and a real sandcastle
//     `Sandbox` both satisfy it for free — the same reasoning already recorded
//     at `phases/context.mts:9-14`.

import { hostGit, type CaptureResult } from "./host-exec.mts";

/** Host `git`, capture-shaped. Injectable so a test can point it at a temp repo. */
export type GitRunner = (args: string[]) => Promise<CaptureResult>;

/** The slice of the sandbox this module uses — one command string, one result. */
export interface ExecSandbox {
  exec(command: string): Promise<{ readonly stdout: string; readonly exitCode: number }>;
}

/**
 * POSIX single-quoting for a value interpolated into a sandbox command: close
 * the quote, emit an escaped apostrophe, reopen. Applied here rather than at
 * the call sites for the same reason `defangPromptArgs` lives inside the phase
 * layer — these functions are exported, so a consumer composing its own
 * lifecycle can pass an issue-derived message or a path with a space, and no
 * caller should have to remember the rule for the hole to stay closed.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Git identity for the sandbox-issued commits; the sandbox has no global one.
 *  Kit-wide rather than preset-private: every commit the host authors on an
 *  agent branch goes out under this name, whichever lifecycle made it. */
const BOT_IDENTITY =
  `-c user.name='sandcastle-agent[bot]' ` +
  `-c user.email='sandcastle-agent[bot]@users.noreply.github.com'`;

/**
 * `git pull --ff-only origin main`; true when it fast-forwarded. Belongs with
 * the branch operations because it is their precondition: the next agent branch
 * is cut from main, so main has to be current first. A non-zero exit means main
 * diverged, which is a stop-before-spending-tokens condition, not an error to
 * throw from here.
 */
export async function syncMain(git: GitRunner = hostGit): Promise<boolean> {
  return (await git(["pull", "--ff-only", "origin", "main"])).exitCode === 0;
}

/**
 * Recreate `branch` locally from `origin/<branch>` when a prior run pushed it,
 * returning whether it resumed. Without this a re-fired run starts a fresh
 * branch off main that could never fast-forward-push over the pushed one — and
 * the trailers that make up the resume set would be invisible.
 *
 * False covers both ways it can decline: origin has no such branch (a first
 * run), and the reset itself failing. The second is reachable — `branch
 * --force` refuses while a worktree holds the branch, which is precisely the
 * preserved-worktree state the ledger preset warns about — and reporting a
 * resume that did not happen would leave the caller on a stale local ref.
 */
export async function resumeFromOrigin(branch: string, git: GitRunner = hostGit): Promise<boolean> {
  const originBranch = await git(["rev-parse", "--verify", "--quiet", `origin/${branch}`]);
  if (originBranch.exitCode !== 0) return false;
  const reset = await git(["branch", "--force", branch, `origin/${branch}`]);
  return reset.exitCode === 0;
}

/**
 * The raw `git log <base>..<branch>` text; "" when the range does not resolve
 * (the branch may not exist yet on a first run, which is not a failure).
 *
 * Raw on purpose: this module transports trailers, it does not know what they
 * mean — parsing them is `task-list`'s job, and the caller's. Symmetric with
 * `commitOnBranch`, whose caller likewise supplies the trailer string.
 */
export async function logSince(
  branch: string,
  base = "origin/main",
  git: GitRunner = hostGit,
): Promise<string> {
  const log = await git(["log", `${base}..${branch}`]);
  return log.exitCode === 0 ? log.stdout : "";
}

/**
 * `git push -u origin <branch>`, THROWING on a non-zero exit. The terminal push
 * of a run: if the branch never reached origin there is nothing to deliver, so
 * failing loudly here is the point.
 */
export async function push(branch: string, git: GitRunner = hostGit): Promise<void> {
  const result = await git(["push", "-u", "origin", branch]);
  if (result.exitCode !== 0) {
    throw new Error(`git push origin ${branch} exited ${result.exitCode}`);
  }
}

/**
 * The same push, mid-loop, which NEVER throws — it reports and returns whether
 * it pushed. A checkpoint push exists for crash resilience, so losing one only
 * narrows the window a resumed run can recover from; it does not invalidate
 * work that is already committed locally and will be pushed again next round.
 *
 * Two named functions rather than one with a `soft` flag: the call site should
 * state whether a failure is fatal, and the two presets had already drifted on
 * exactly that question while sharing the same inline command.
 */
export async function pushCheckpoint(branch: string, git: GitRunner = hostGit): Promise<boolean> {
  const result = await git(["push", "-u", "origin", branch]);
  if (result.exitCode !== 0) {
    console.error(`Mid-loop git push origin ${branch} exited ${result.exitCode}; continuing.`);
    return false;
  }
  return true;
}

/**
 * A host-authored commit on the branch inside the sandbox, optionally carrying
 * a trailer. `--allow-empty` is unconditional: it only *permits* an empty
 * commit rather than forcing one, so there is nothing for a caller to decide —
 * and the trailer-only commits this exists for are empty by construction, the
 * task's own work having already been committed by the session.
 *
 * Throws on a non-zero exit. Because `--allow-empty` already excludes the one
 * benign reason `git commit` fails, anything left (a hook rejecting it, a
 * broken index) means the commit did not happen — and for a trailer commit that
 * silently loses the durable record the resume set is read from.
 */
export async function commitOnBranch(
  sandbox: ExecSandbox,
  message: string,
  opts: { trailer?: string } = {},
): Promise<void> {
  const trailer = opts.trailer ? ` --trailer ${shellQuote(opts.trailer)}` : "";
  const result = await sandbox.exec(
    `git ${BOT_IDENTITY} commit --allow-empty -m ${shellQuote(message)}${trailer}`,
  );
  if (result.exitCode !== 0) {
    throw new Error(`git commit ${shellQuote(message)} in the sandbox exited ${result.exitCode}`);
  }
}

/**
 * Remove the run artifacts from the branch and commit the removal. Returns
 * false when there was nothing tracked to remove — and false ONLY for that.
 * Nothing tracked is the ordinary outcome of a clean run: a task session writes
 * `AGENT_NOTES.md` only when something forced a departure from the plan, and a
 * review session may leave no summary, so "no artifacts" is not a problem to
 * report.
 *
 * A failure to remove them IS, so it throws rather than folding into the same
 * false. Conflating the two would make the return value untestable by a caller:
 * `git rm` refuses a directory without `-r` (exit 128, nothing changed) and a
 * hook can reject the commit, and a caller that read false as "failed" would
 * abort every clean run, while one that read it as "fine" would push a branch
 * still carrying the artifacts.
 *
 * The `rm` and the commit stay ONE chained exec rather than reusing
 * `commitOnBranch`: split in two, a failed `rm` would still be followed by a
 * commit, leaving an orphan commit claiming a removal that never happened.
 */
export async function dropArtifacts(
  sandbox: ExecSandbox,
  files: readonly string[],
): Promise<boolean> {
  // Two separate hazards, two separate defences. `shellQuote` stops `sh` seeing
  // a space as an argument break or a metacharacter as syntax. `:(literal)`
  // stops GIT globbing what survives: a pathspec matches wildcards on its own,
  // shell quoting notwithstanding, so a bare `notes/*.md` would have `git rm`
  // delete every tracked file matching it — and commit that.
  const list = files.map((file) => shellQuote(`:(literal)${file}`)).join(" ");
  const tracked = await sandbox.exec(`git ls-files -- ${list}`);
  // The probe's own failure is not an answer. An unreadable index exits
  // non-zero with empty stdout, which is indistinguishable from "nothing
  // tracked" unless the code looks — and `false` promises the caller a clean
  // no-op, not an unanswered question.
  if (tracked.exitCode !== 0) {
    throw new Error(`probing for run artifacts (${files.join(", ")}) exited ${tracked.exitCode}`);
  }
  if (tracked.stdout.trim().length === 0) return false;
  const removed = await sandbox.exec(
    // -f: the session that produced an artifact may have left it dirty in the
    // worktree, and a plain `git rm` refuses on modified files.
    `git rm -q -f --ignore-unmatch ${list} && ` +
      `git ${BOT_IDENTITY} commit -m 'chore(agent): drop run artifacts'`,
  );
  if (removed.exitCode !== 0) {
    throw new Error(`dropping run artifacts (${files.join(", ")}) exited ${removed.exitCode}`);
  }
  return true;
}
