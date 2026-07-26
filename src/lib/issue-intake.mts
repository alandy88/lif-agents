// Pure admission decisions for the issue-driven lifecycle, extracted out of
// `presets/implement.mts`'s `main()`. This module reads and decides; it never
// writes. The single write-then-throw the four guards used to repeat is now
// `main`'s job alone, driven off the `Admission` this returns.

import type { Issue } from "./github-issue.mts";
import { resolvePhases, type ResolvedPhases } from "./profiles.mts";

/**
 * Deliberately the narrow read pair, not `IssueBodySource`: intake never
 * writes (no `comment`, no `setBody`), so its dependency surface says so.
 */
export type IntakeReads = {
  getIssue: (issueNumber: number) => Promise<Issue>;
  issueIsEpic: (issueNumber: number) => Promise<boolean>;
};

export type IntakeRequest = {
  issueNumber: number;
  /** "issues" means label-triggered; anything else is workflow_dispatch. */
  trigger?: string;
  dispatchProfile?: string;
  modelOverride?: string;
  defaultProfile?: string;
};

/**
 * `cause` is load-bearing and asymmetric by design: only the configuration
 * path sets it, carrying the raw `resolvePhases` error underneath a wrapped
 * `detail` string (the issue comment gets the wrapped text; `main`'s
 * `throw admission.cause ?? new Error(admission.detail)` gets the original).
 * Closed and epic rejections set no `cause`, so `main` throws a fresh
 * `Error(detail)` for those instead.
 */
export type Admission =
  | { kind: "admitted"; issue: Issue; run: ResolvedPhases }
  | { kind: "skipped"; reason: string }
  | { kind: "rejected"; detail: string; cause?: unknown };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The four admission guards, in the order `main` used to run them — a closed
 * issue is rejected before a missing label is skipped, and both precede the
 * epic check and profile resolution.
 */
export async function admit(request: IntakeRequest, reads: IntakeReads): Promise<Admission> {
  const issue = await reads.getIssue(request.issueNumber);

  if (issue.state === "CLOSED") {
    return {
      kind: "rejected",
      detail: `Issue #${request.issueNumber} is closed; the sandcastle-agent run requires an open issue.`,
    };
  }

  if (request.trigger === "issues" && !issue.labels.includes("ready-for-agent")) {
    return {
      kind: "skipped",
      reason: `Issue #${request.issueNumber} no longer has the ready-for-agent label (removed while queued) — skipping.`,
    };
  }

  if (await reads.issueIsEpic(request.issueNumber)) {
    return {
      kind: "rejected",
      detail:
        `Issue #${request.issueNumber} has native GitHub sub-issues (it's an epic); the sandcastle-agent run ` +
        `only handles atomic issues. Run the sub-issues individually instead.`,
    };
  }

  let run: ResolvedPhases;
  try {
    run = resolvePhases({
      labels: issue.labels,
      dispatchProfile: request.dispatchProfile,
      defaultProfile: request.defaultProfile,
      modelOverride: request.modelOverride,
    });
  } catch (error) {
    return {
      kind: "rejected",
      detail: `sandcastle-agent configuration rejected: ${errorMessage(error)}`,
      cause: error,
    };
  }

  return { kind: "admitted", issue, run };
}
