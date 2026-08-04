// Shared plumbing for the integration tier: real `git` in throwaway temp
// repos. These tests exist to check the assumptions the unit-level mocks
// encode — real trailer formatting, real ref rules, real worktree/branch
// interactions — so nothing here stubs git.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capture, type CaptureResult } from "../../src/lib/host-exec.mts";

export function makeTempRoot(): string {
  return mkdtempSync(join(tmpdir(), "sandcastle-it-"));
}

export function removeTempRoot(root: string): void {
  // maxRetries: Windows keeps read-only object files under .git.
  rmSync(root, { recursive: true, force: true, maxRetries: 5 });
}

/** A `git -C <dir>` runner with identity pinned so commits work anywhere. */
export function gitIn(dir: string): (args: string[]) => Promise<CaptureResult> {
  return (args) =>
    capture("git", [
      "-C",
      dir,
      "-c",
      "user.name=sandcastle-it",
      "-c",
      "user.email=it@invalid",
      ...args,
    ]);
}

/** Run a setup command and throw on failure — setup bugs must not read as test results. */
export async function must(
  git: (args: string[]) => Promise<CaptureResult>,
  args: string[],
): Promise<CaptureResult> {
  const result = await git(args);
  if (result.exitCode !== 0) {
    throw new Error(`setup: git ${args.join(" ")} exited ${result.exitCode}: ${result.stderr}`);
  }
  return result;
}
