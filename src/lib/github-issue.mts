// GitHub issue adapter for the sandcastle-agent. Orchestration consumes the
// IssueBodySource seam; only this module knows the concrete `gh` commands.

import { ghCapture, ghJson } from "./host-exec.mts";

export type Issue = {
  title: string;
  body: string;
  state?: string;
  labels: string[];
};

export type IssueBodySource = {
  getIssue: (issueNumber: number) => Promise<Issue>;
  setBody: (issueNumber: number, body: string) => Promise<void>;
  comment: (issueNumber: number, body: string) => Promise<void>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function getIssue(issueNumber: number): Promise<Issue> {
  const out = await ghJson([
    "issue",
    "view",
    String(issueNumber),
    "--json",
    "title,state,body,labels",
  ]);
  const parsed = JSON.parse(out) as {
    title: string;
    state?: string;
    body?: string;
    labels?: { name: string }[];
  };
  return {
    title: parsed.title,
    state: parsed.state,
    body: parsed.body ?? "",
    labels: (parsed.labels ?? []).map((label) => label.name),
  };
}

export async function commentOnIssue(issueNumber: number, body: string): Promise<void> {
  const result = await ghCapture(["issue", "comment", String(issueNumber), "--body", body]);
  if (result.exitCode !== 0) throw new Error(`gh issue comment exited ${result.exitCode}`);
}

export async function setIssueBody(issueNumber: number, body: string): Promise<void> {
  const result = await ghCapture(["issue", "edit", String(issueNumber), "--body", body]);
  if (result.exitCode !== 0) throw new Error(`gh issue edit --body exited ${result.exitCode}`);
}

async function repoSlug(): Promise<string> {
  const envSlug = process.env.GITHUB_REPOSITORY?.trim();
  if (envSlug) return envSlug;
  try {
    return (
      await ghJson(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"])
    ).trim();
  } catch {
    return "";
  }
}

// Fails open so a transient gh outage does not block every atomic run. The
// warning makes the exceptional routing decision visible in workflow logs.
export async function issueIsEpic(issueNumber: number): Promise<boolean> {
  const slug = await repoSlug();
  if (!slug) {
    console.error(
      `[epic-guard] Could not resolve the repo slug; assuming #${issueNumber} is atomic — an epic could slip through this guard.`,
    );
    return false;
  }
  try {
    const out = await ghJson([
      "api",
      `repos/${slug}/issues/${issueNumber}/sub_issues`,
      "--jq",
      "length",
    ]);
    return Number(out.trim()) > 0;
  } catch (error) {
    console.error(
      `[epic-guard] Sub-issues lookup for #${issueNumber} failed (${errorMessage(error)}); ` +
        `assuming atomic — an epic could slip through this guard.`,
    );
    return false;
  }
}

export const githubIssueSource: IssueBodySource = {
  getIssue,
  comment: commentOnIssue,
  setBody: setIssueBody,
};
