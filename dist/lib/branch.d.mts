import { type CaptureResult } from "./host-exec.mts";
/** Host `git`, capture-shaped. Injectable so a test can point it at a temp repo. */
export type GitRunner = (args: string[]) => Promise<CaptureResult>;
/** The slice of the sandbox this module uses — one command string, one result. */
export interface ExecSandbox {
    exec(command: string): Promise<{
        readonly stdout: string;
        readonly exitCode: number;
    }>;
}
/**
 * `git pull --ff-only origin main`; true when it fast-forwarded. Belongs with
 * the branch operations because it is their precondition: the next agent branch
 * is cut from main, so main has to be current first. A non-zero exit means main
 * diverged, which is a stop-before-spending-tokens condition, not an error to
 * throw from here.
 */
export declare function syncMain(git?: GitRunner): Promise<boolean>;
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
export declare function resumeFromOrigin(branch: string, git?: GitRunner): Promise<boolean>;
/**
 * The raw `git log <base>..<branch>` text; "" when the range does not resolve
 * (the branch may not exist yet on a first run, which is not a failure).
 *
 * Raw on purpose: this module transports trailers, it does not know what they
 * mean — parsing them is `task-list`'s job, and the caller's. Symmetric with
 * `commitOnBranch`, whose caller likewise supplies the trailer string.
 */
export declare function logSince(branch: string, base?: string, git?: GitRunner): Promise<string>;
/**
 * `git push -u origin <branch>`, THROWING on a non-zero exit. The terminal push
 * of a run: if the branch never reached origin there is nothing to deliver, so
 * failing loudly here is the point.
 */
export declare function push(branch: string, git?: GitRunner): Promise<void>;
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
export declare function pushCheckpoint(branch: string, git?: GitRunner): Promise<boolean>;
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
export declare function commitOnBranch(sandbox: ExecSandbox, message: string, opts?: {
    trailer?: string;
}): Promise<void>;
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
export declare function dropArtifacts(sandbox: ExecSandbox, files: readonly string[]): Promise<boolean>;
//# sourceMappingURL=branch.d.mts.map