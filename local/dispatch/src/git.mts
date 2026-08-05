// Shared git execution seam. Both dispatch.mts and collect.mts talk to git;
// this is the one implementation, injectable for tests, never a shell.

import { execFile } from "node:child_process";

export interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
}

export type GitExec = (args: string[], cwd?: string) => Promise<GitResult>;

export const defaultGitExec: GitExec = (args, cwd) =>
  new Promise((resolve) => {
    execFile(
      "git",
      args,
      { cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
        resolve({ stdout: String(stdout), stderr: String(stderr), code });
      },
    );
  });

export class GitError extends Error {
  readonly args: string[];
  readonly stderr: string;
  readonly code: number;

  constructor(args: string[], result: GitResult) {
    super(`git ${args.join(" ")} failed (exit ${result.code}): ${result.stderr.trim()}`);
    this.name = "GitError";
    this.args = args;
    this.stderr = result.stderr;
    this.code = result.code;
  }
}

/** Run git, throw GitError on nonzero exit, return trimmed stdout. */
export async function git(
  args: string[],
  cwd?: string,
  exec: GitExec = defaultGitExec,
): Promise<string> {
  const result = await exec(args, cwd);
  if (result.code !== 0) throw new GitError(args, result);
  return result.stdout.replace(/\r\n/g, "\n").replace(/\n$/, "");
}
