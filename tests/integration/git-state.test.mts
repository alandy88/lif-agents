// The loop's durable state lives in git: `Task-Done` trailers on real commits,
// branch names derived from human task labels, and a local branch reset to a
// pushed one on resume. The unit tests parse hand-written strings and fake the
// sandbox; these run the same kit functions against what git actually emits and
// accepts.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { capture } from "../../src/lib/host-exec.mts";
import {
  commitOnBranch,
  dropArtifacts,
  logSince,
  resumeFromOrigin,
  type ExecSandbox,
} from "../../src/lib/branch.mts";
import { parseTaskDoneTrailers, taskDoneTrailer } from "../../src/lib/task-list.mts";
import { taskBranch } from "../../src/presets/task/state.mts";
import { gitIn, makeTempRoot, must, removeTempRoot } from "./helpers.mts";

const BRANCH = "agent/issue-9";

/**
 * `commitOnBranch` and `dropArtifacts` hand the sandbox ONE POSIX shell command
 * string — single-quoted arguments, and `&&` between two commands — so a real
 * `sh` is the only faithful stand-in; cmd.exe would mangle both. Windows has no
 * `sh` on PATH, but Git for Windows ships one, and `git --exec-path` locates the
 * install root it sits under. Missing means the adapter is broken, not that the
 * test may quietly run a weaker command, so this throws.
 */
function posixShell(): string {
  if (process.platform !== "win32") return "sh";
  const execPath = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim();
  const shell = join(execPath, "..", "..", "..", "bin", "sh.exe");
  if (!existsSync(shell)) {
    throw new Error(`no POSIX sh to run the sandbox adapter through (looked for ${shell})`);
  }
  return shell;
}

/** An `ExecSandbox` whose commands run in `dir`. Forward slashes: `sh` reads a
 *  backslash inside single quotes as a literal character, not a separator. */
function sandboxIn(dir: string): ExecSandbox {
  const shell = posixShell();
  const cwd = dir.replace(/\\/g, "/");
  return {
    async exec(command: string) {
      const result = await capture(shell, ["-c", `cd '${cwd}' && ${command}`]);
      return { stdout: result.stdout, exitCode: result.exitCode };
    },
  };
}

let root: string;
let repo: string;
let git: ReturnType<typeof gitIn>;

before(async () => {
  root = makeTempRoot();
  repo = join(root, "repo");
  await must(gitIn(root), ["init", "-b", "main", repo]);
  git = gitIn(repo);
});

after(() => removeTempRoot(root));

test("Task-Done trailers survive a real commitOnBranch → logSince round-trip", async () => {
  await must(git, ["commit", "--allow-empty", "-m", "base"]);
  await must(git, ["checkout", "-b", BRANCH]);

  // git log's default format indents the body by four spaces — exactly the
  // formatting the parser's anchored regex has to tolerate.
  const sandbox = sandboxIn(repo);
  await commitOnBranch(sandbox, "chore(tasks): complete task 1", { trailer: taskDoneTrailer(1) });
  await commitOnBranch(sandbox, "chore(tasks): complete task 2", { trailer: taskDoneTrailer(2) });
  // Prose mentioning a trailer mid-line must NOT count as one.
  await must(git, [
    "commit",
    "--allow-empty",
    "-m",
    "notes\n\nreverted; see Task-Done: 9 in the earlier discussion",
  ]);

  assert.deepEqual(parseTaskDoneTrailers(await logSince(BRANCH, "main", git)), new Set([1, 2]));
  await must(git, ["checkout", "main"]);
});

test("an apostrophe in a message survives the sandbox's shell, message and trailer alike", async () => {
  // These helpers are exported, so a Layer-4 consumer can pass an issue-derived
  // message. Unescaped, `user's` closes the single quote early and git never
  // sees a valid command — a real `sh` is the only thing that proves otherwise,
  // which is why this is here rather than an assertion on the command string.
  await must(git, ["checkout", "-b", "agent/quoting"]);
  const message = "fix user's config; echo pwned";

  await commitOnBranch(sandboxIn(repo), message, { trailer: "Task-Done: 1'; echo pwned" });

  const subject = await must(git, ["log", "-1", "--format=%s"]);
  assert.equal(subject.stdout.trim(), message);
  const body = await must(git, ["log", "-1", "--format=%(trailers)"]);
  assert.match(body.stdout, /Task-Done: 1'; echo pwned/);
  await must(git, ["checkout", "main"]);
});

test("a wildcard in an artifact name matches nothing rather than every sibling", async () => {
  // Shell quoting is not enough here: git matches wildcards in a pathspec
  // itself, so `notes/*.md` reaches `git rm` as a pattern even fully quoted,
  // and the removal of every match would be committed. `:(literal)` is what
  // makes the name a name. Asserted against real git because the difference is
  // invisible in the command string.
  await must(git, ["checkout", "-b", "agent/pathspec"]);
  await mkdir(join(repo, "notes"), { recursive: true });
  await writeFile(join(repo, "notes", "a.md"), "a");
  await writeFile(join(repo, "notes", "b.md"), "b");
  await must(git, ["add", "-A"]);
  await must(git, ["commit", "-m", "notes"]);

  const committed = await dropArtifacts(sandboxIn(repo), ["notes/*.md"]);

  assert.equal(committed, false, "a wildcard name matches no literal file");
  const tracked = await must(git, ["ls-files", "--", "notes/"]);
  assert.match(tracked.stdout, /notes\/a\.md/);
  assert.match(tracked.stdout, /notes\/b\.md/);
  await must(git, ["checkout", "main"]);
});

test("dropArtifacts reports the failure instead of claiming a commit", async () => {
  // `git rm` refuses a directory without -r: exit 128, nothing staged, nothing
  // committed. The return value has to be the exec's verdict rather than "we
  // got as far as running it", or the caller pushes a branch it believes was
  // cleaned. Reachable through the exported helper, hence the real-git check.
  await must(git, ["checkout", "-b", "agent/rm-failure"]);
  await mkdir(join(repo, "scratch"), { recursive: true });
  await writeFile(join(repo, "scratch", "kept.md"), "keep me");
  await must(git, ["add", "-A"]);
  await must(git, ["commit", "-m", "scratch"]);
  const before = (await must(git, ["rev-parse", "HEAD"])).stdout.trim();

  const committed = await dropArtifacts(sandboxIn(repo), ["scratch"]);

  assert.equal(committed, false, "a refused `git rm` is not a successful cleanup");
  assert.equal((await must(git, ["rev-parse", "HEAD"])).stdout.trim(), before, "no commit landed");
  assert.match((await must(git, ["ls-files"])).stdout, /scratch\/kept\.md/);
  await must(git, ["checkout", "main"]);
});

test("resumeFromOrigin declines when a worktree holds the branch", async () => {
  // The `4933566` incident shape, on the resume side: `branch --force` refuses
  // while a worktree has the branch checked out. Reporting true there would
  // leave the caller on a stale local ref believing it had the remote tip.
  const origin = join(root, "held-origin.git");
  await must(gitIn(root), ["init", "--bare", "-b", "main", origin]);
  const writer = join(root, "held-writer");
  await must(gitIn(root), ["clone", origin, writer]);
  await must(gitIn(writer), ["commit", "--allow-empty", "-m", "init"]);
  await must(gitIn(writer), ["push", "origin", "main"]);
  await must(gitIn(writer), ["checkout", "-b", BRANCH]);
  await must(gitIn(writer), ["commit", "--allow-empty", "-m", "task 1"]);
  await must(gitIn(writer), ["push", "-u", "origin", BRANCH]);

  const runner = join(root, "held-runner");
  await must(gitIn(root), ["clone", origin, runner]);
  const runnerGit = gitIn(runner);
  await must(runnerGit, ["branch", BRANCH, `origin/${BRANCH}`]);
  // A worktree still holding it — exactly what a preserved sandbox worktree
  // leaves behind, and what makes `branch --force` refuse.
  await must(runnerGit, ["worktree", "add", join(root, "held-wt"), BRANCH]);

  assert.equal(await resumeFromOrigin(BRANCH, runnerGit), false);
});

test("resumeFromOrigin resets a stale local branch to origin's tip", async () => {
  const origin = join(root, "resume-origin.git");
  await must(gitIn(root), ["init", "--bare", "-b", "main", origin]);

  // A prior run's clone: it pushes the agent branch, then pushes again — the
  // second push is the work a resumed run must not start behind.
  const writer = join(root, "resume-writer");
  await must(gitIn(root), ["clone", origin, writer]);
  await must(gitIn(writer), ["commit", "--allow-empty", "-m", "init"]);
  await must(gitIn(writer), ["push", "origin", "main"]);
  await must(gitIn(writer), ["checkout", "-b", BRANCH]);
  await must(gitIn(writer), ["commit", "--allow-empty", "-m", "task 1"]);
  await must(gitIn(writer), ["push", "-u", "origin", BRANCH]);

  // The re-fired run's checkout: it already has a local branch at the older
  // tip, and sits on main (the preset resumes before the sandbox checks the
  // agent branch out — `branch --force` refuses on a checked-out branch).
  const runner = join(root, "resume-runner");
  const runnerGit = gitIn(runner);
  await must(gitIn(root), ["clone", origin, runner]);
  await must(runnerGit, ["branch", BRANCH, `origin/${BRANCH}`]);

  await must(gitIn(writer), ["commit", "--allow-empty", "-m", "task 2"]);
  await must(gitIn(writer), ["push", "origin", BRANCH]);
  await must(runnerGit, ["fetch", "origin"]);

  const stale = (await must(runnerGit, ["rev-parse", BRANCH])).stdout.trim();
  const tip = (await must(runnerGit, ["rev-parse", `origin/${BRANCH}`])).stdout.trim();
  assert.notEqual(stale, tip, "setup: the local branch should start behind origin");

  assert.equal(await resumeFromOrigin(BRANCH, runnerGit), true);
  assert.equal((await must(runnerGit, ["rev-parse", BRANCH])).stdout.trim(), tip);
});

test("every taskBranch output is a name git will actually create", async () => {
  const labels = [
    "1.4 Nature kit data",
    "Fix: verify/deliver ordering (again!)",
    "Ünïcode täsk läbel",
    "..dots..and..--dashes--..",
    "!!!", // slug collapses to nothing → "task" fallback
    "a label long enough to hit the 48-character slug bound, twice over, easily",
  ];
  for (const label of labels) {
    const branch = taskBranch(label);
    const created = await git(["branch", branch]);
    assert.equal(created.exitCode, 0, `git rejected ${branch} (from "${label}"): ${created.stderr}`);
    await must(git, ["branch", "-D", branch]);
  }
});
