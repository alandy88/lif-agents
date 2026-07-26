// The next version for a release, derived from the commits since the last tag.
//
// Split deliberately: this module decides WHAT version, and `release-gate.mts`
// decides WHETHER to release at all. The two are different questions and the
// repo has already been bitten by conflating them — `bb2f75a` ("chore: bump
// routing model ids") changed the model every consumer run resolves, and a
// commit-type filter would have shipped nothing for it. So the gate's release
// test is "did the installable payload change", and this module's floor is `patch`:
// anything that alters the built output is worth a tag, and the commit types
// only decide how big a tag.
//
// That inverts the usual convention (semantic-release releases on feat/fix/perf
// and stays silent otherwise) on purpose. Consumers here pin tags and install
// from git, so an unreleased change on main is invisible to them — the failure
// mode is a change that never ships, not a tag nobody needed.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { isEntrypoint } from "../src/lib/entrypoint.mts";
// Tag discovery and the form a tag must take belong with the release gate: they
// are discovery, and the gate needs the same baseline to diff the payload
// against. Imported rather than restated so there is one rule, not two.
import { lastReleaseTag, TAG_FORM } from "./release-gate.mts";

/** How much of the public surface a change moves. `fix` is the floor, not a claim. */
export type Impact = "breaking" | "feature" | "fix";

// `type(scope)!:` and a `BREAKING CHANGE:` body line are both Conventional
// Commits' breaking markers; accept either.
const BREAKING_SUBJECT = /^[a-z]+(\([^)]*\))?!:/;
const BREAKING_BODY = /^BREAKING[ -]CHANGE:/m;
const FEATURE = /^feat(\([^)]*\))?:/;

/**
 * The largest impact claimed by any of these commit messages, floored at `fix`.
 *
 * The floor is the point: an unrecognized subject (`chore:`, a bare sentence)
 * means the author did not classify the change, NOT that the change is empty.
 * Reading silence as "no release" is what stranded the model-id bump.
 */
export function classify(messages: readonly string[]): Impact {
  let impact: Impact = "fix";
  for (const message of messages) {
    const subject = message.split("\n", 1)[0] ?? "";
    if (BREAKING_SUBJECT.test(subject) || BREAKING_BODY.test(message)) return "breaking";
    if (FEATURE.test(subject)) impact = "feature";
  }
  return impact;
}

/**
 * Apply `impact` to `version`.
 *
 * Below 1.0.0 a breaking change is a MINOR bump, not a major one: SemVer §4
 * gives no stability guarantee under 1.0.0, so spending the major on it would
 * claim a 1.0 the kit has not earned. The consumers' pinning discipline is what
 * actually protects them from breakage, not the digit.
 */
export function bump(version: string, impact: Impact): string {
  const parts = version.split(".").map(Number);
  const [major = 0, minor = 0, patch = 0] = parts;
  // Safe, not merely integer: `Number("999999999999999999999999")` is 1e+24,
  // which IS an integer, and this guard used to wave it through and return the
  // string `1e+24.0.1`. `TAG_FORM` now bounds discovered tags, but this function
  // is exported and reachable on its own, so it checks what it actually needs.
  if (parts.length !== 3 || parts.some((n) => !Number.isSafeInteger(n) || n < 0)) {
    throw new Error(`not a semver version: ${version}`);
  }
  if (major === 0) {
    return impact === "fix" ? `0.${minor}.${patch + 1}` : `0.${minor + 1}.0`;
  }
  if (impact === "breaking") return `${major + 1}.0.0`;
  if (impact === "feature") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** `v0.2.3` -> `0.2.3`. Tags carry the prefix; npm and this module do not. */
export function stripPrefix(tag: string): string {
  return tag.startsWith("v") ? tag.slice(1) : tag;
}

/** The version a release cut from `lastTag` with these commits should carry. */
export function nextVersion(lastTag: string, messages: readonly string[]): string {
  return bump(stripPrefix(lastTag), classify(messages));
}

/** Numeric semver ordering; -1, 0 or 1. Only the release-relevant `x.y.z` core. */
export function compare(a: string, b: string): number {
  const left = stripPrefix(a).split(".").map(Number);
  const right = stripPrefix(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * Validate an operator-supplied tag against the last one. Explicit beats
 * derived — a human naming `v0.3.0` to mark a milestone is a decision the
 * commit types cannot express — but it still has to move forward, because a
 * typo'd downgrade would cut a tag that resolves ahead of nothing.
 */
export function resolveExplicit(explicit: string, lastTag: string): string {
  if (!TAG_FORM.test(explicit)) {
    throw new Error(`version must look like v1.2.3, got: ${explicit}`);
  }
  if (compare(explicit, lastTag) <= 0) {
    throw new Error(`${explicit} does not move forward from ${lastTag}`);
  }
  return stripPrefix(explicit);
}

/** Host `git`, stdout as text — only the commit log is read here. */
const git = (args: string[]) => execFileSync("git", args, { encoding: "utf8" });

async function main(): Promise<void> {
  // The workflow resolves the baseline first (it needs the same one to diff
  // dist/ against) and passes it down, so the two cannot disagree mid-run if a
  // tag lands between the steps. Falls back for a standalone invocation.
  const lastTag = process.env.LAST_TAG?.trim() || (await lastReleaseTag());

  const explicit = process.env.EXPLICIT?.trim();
  // Every commit on a first release, everything since the tag on any other.
  // `${lastTag}..HEAD` is only a valid revision when the tag exists.
  const range = lastTag ? `${lastTag}..HEAD` : "HEAD";
  // NUL-separated so a commit body containing a blank line stays one message.
  const messages = git(["log", "--format=%B", "-z", range])
    .split("\0")
    .map((message) => message.trim())
    .filter((message) => message.length > 0);

  // Absent a tag the bump starts from 0.0.0 — as a version to add to, never as
  // a revision to ask git about.
  const baseline = lastTag ?? "v0.0.0";
  const version = explicit ? resolveExplicit(explicit, baseline) : nextVersion(baseline, messages);
  const how = explicit ? "explicit" : classify(messages);

  console.log(`${lastTag ?? "(no tags)"} -> v${version} (${how}, ${messages.length} commits)`);
  const out = process.env.GITHUB_OUTPUT;
  if (out) appendFileSync(out, `version=${version}\nlast=${lastTag ?? ""}\n`);
}

if (isEntrypoint(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    // `::error::` so a rejected version surfaces as an annotation on the run
    // rather than as a stack trace a reader has to scroll a log to find.
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
