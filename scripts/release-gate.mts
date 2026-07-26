// Whether to release at all — the gate the release workflow runs before it
// decides WHAT version to cut (scripts/next-version.mts answers that).
//
// This lived as inline shell in .github/workflows/release.yml, where no test
// could reach it: four rounds of review found seven bugs, every one in that
// shell and none in the TypeScript beside it. Both decisions here are about
// what real git does with real refs and real pathspecs — the class of thing a
// mock cannot encode — so they belong somewhere the integration tier can drive
// them against a temp repo with a real release topology. The workflow keeps the
// orchestration: the git writes, the tag push, the `gh release` calls.
//
// The seam is host `git`, capture-shaped and injectable, the same shape
// `tests/integration/helpers.mts`'s `gitIn(dir)` returns.

import { appendFileSync, readFileSync } from "node:fs";
import { hostGit } from "../src/lib/host-exec.mts";
import { isEntrypoint } from "../src/lib/entrypoint.mts";
// The kit's name for "host git, capture-shaped, injectable" (src/lib/branch.mts
// declares it for the same reason). Type-only, so scripts/ takes on no runtime
// dependency on lib/ by borrowing it.
import type { GitRunner } from "../src/lib/branch.mts";

/**
 * The strict form a release tag must take. Shared with `next-version.mts`,
 * which holds an operator's explicit version to the same rule: a tag that would
 * be derived from has to be a tag that can be derived from.
 *
 * Each component is bounded rather than `[0-9]+`, and rejects leading zeros,
 * because "parses as a number" is not the same as "npm can version it". A tag
 * that passes here becomes the BASELINE the next release is bumped from, so
 * every way `Number` can quietly misread one is a way to strand releases:
 *
 * - `v999999999999999999999999.0.0` -> `Number` gives 1e+24, which is an
 *   integer, so `bump` accepts it and returns the string `1e+24.0.1`. The later
 *   `npm version` rejects that, and every automatic release stays blocked until
 *   somebody deletes the tag.
 * - `v9007199254740993.0.0` -> past 2^53 the value rounds DOWN by one, so the
 *   bump derives from a version that is not the tag it read.
 * - `v01.0.0` -> the worst of the three, because it fails silently: it bumps to
 *   `1.0.1`, which may already exist. SemVer forbids leading zeros for exactly
 *   this reason.
 *
 * 15 digits keeps every component inside `Number.MAX_SAFE_INTEGER`. Bounding it
 * HERE rather than throwing in `bump` is what the `v1` fix established: a tag
 * that is not a release tag should be filtered out of discovery and ignored, not
 * turned into a fatal error that blocks the releases it has nothing to do with.
 */
const COMPONENT = "(0|[1-9][0-9]{0,14})";
export const TAG_FORM = new RegExp(`^v${COMPONENT}\\.${COMPONENT}\\.${COMPONENT}$`);

/**
 * The newest release tag, or `null` when none exists yet.
 *
 * Enumerated and version-sorted, NOT `git describe`. `describe` only finds tags
 * reachable from HEAD, and a release tag here is never reachable from `main`:
 * the release commit is an unmerged CHILD of the `main` commit it was cut from,
 * and only its tag ref is pushed. So from a later `main` the tag is a sibling,
 * `describe` reports no tag at all, and the derivation would restart at v0.0.0
 * and try to re-cut a version that already exists.
 *
 * `v[0-9]*` is only a cheap prefilter, and `TAG_FORM` is not redundant with it:
 * the glob also admits a moving `v1` major alias (which this repo invites,
 * since consumers reference .github/workflows/agent.yml by tag), a
 * `v0.3.0-rc.1` and a `v0.2-backup`. Version sort puts `v1` FIRST, ahead of
 * every real release, and `bump("1")` throws on it — so one stray tag would
 * block every automatic release from then on.
 *
 * `null` rather than a `v0.0.0` sentinel: the caller uses this value as BOTH a
 * version to bump from and a git revision to log since, and only the first has
 * a sensible zero. `git log v0.0.0..HEAD` against a tag that does not exist is
 * a fatal ambiguous-revision error, which would fail every first release.
 *
 * A repo with no tags exits 0 with empty output, so a NON-zero exit is git
 * itself failing, not a first release. Throwing keeps those apart: read as "no
 * tags", a broken checkout would derive from v0.0.0 and try to re-cut a version
 * that already exists — wrong silently, and only failing later at `git tag`.
 * The shell's `|| true` covered grep's empty-match exit; carrying it onto git's
 * own exit code widened it into that hole.
 */
export async function releaseTags(git: GitRunner = hostGit): Promise<string[]> {
  const listed = await git(["tag", "--list", "v[0-9]*", "--sort=-v:refname"]);
  if (listed.exitCode !== 0) {
    throw new Error(`enumerating release tags exited ${listed.exitCode}: ${listed.stderr}`);
  }
  return listed.stdout
    .split("\n")
    .map((tag) => tag.trim())
    .filter((tag) => TAG_FORM.test(tag));
}

/** The newest release tag, or `null` when none exists yet. See `releaseTags`. */
export async function lastReleaseTag(git: GitRunner = hostGit): Promise<string | null> {
  return (await releaseTags(git))[0] ?? null;
}

/**
 * Is this run standing on something other than the current tip of `main`?
 *
 * A run checks out the SHA of the event that triggered it, and the concurrency
 * lock does not change that — GitHub documents queued runs as being handled in
 * arbitrary order, so `cancel-in-progress: false` serializes without ordering.
 * The reachable case is a rerun: a run whose publish failed is exactly the thing
 * an operator retries, and if anything released in between, the retry would
 * compare its OLDER payload against the NEWER tag, read the rollback as a
 * change, and cut a higher version carrying superseded code.
 *
 * Skipping is safe and loses nothing: `main`'s tip descends from this commit, so
 * whatever this run would have shipped is already in what the newer run ships.
 *
 * Fetches first, and the fetch is INSIDE this function rather than left to the
 * caller. It was the caller's a moment ago, and the caller dropped the result:
 * `hostGit` never rejects, it resolves a non-zero `exitCode`, so a transient
 * fetch failure silently left the comparison running against the cached
 * `origin/main` from checkout — a superseded HEAD reading as current, which is
 * the exact failure this function exists to prevent. A freshness check that can
 * quietly compare against stale data is worse than none, so both the fetch and
 * the resolution throw rather than guess.
 */
export async function headIsStale(git: GitRunner = hostGit): Promise<boolean> {
  const fetched = await git(["fetch", "--quiet", "origin", "main"]);
  if (fetched.exitCode !== 0) {
    throw new Error(
      `fetching origin/main to check freshness exited ${fetched.exitCode}: ${fetched.stderr}`,
    );
  }
  const head = await git(["rev-parse", "HEAD"]);
  const tip = await git(["rev-parse", "origin/main"]);
  if (head.exitCode !== 0 || tip.exitCode !== 0) {
    throw new Error(`resolving HEAD against origin/main exited ${head.exitCode}/${tip.exitCode}`);
  }
  return head.stdout.trim() !== tip.stdout.trim();
}

/** The working `package.json`, as text. A seam only because the comparison
 *  below reads the worktree rather than a ref, and the tests run in temp repos. */
export type ReadPackageJson = () => string;

const readWorkingPackageJson: ReadPackageJson = () => readFileSync("package.json", "utf8");

/**
 * Every path a tag delivers to somebody else — derived from the manifest rather
 * than listed here.
 *
 * Four review rounds each found one more path that ships and was not on the
 * list (`templates`, `package.json`, `.github/workflows/agent.yml`, `README.md`).
 * The list was the bug: it stated a rule and was then maintained from memory.
 * Reading `files` ends that class — a path that starts shipping starts being
 * watched in the same commit that ships it.
 *
 * npm's always-packed set is documented as `package.json`, `README`,
 * `LICENSE`/`LICENCE`, the `main` file and the `bin` file(s) — shipped whatever
 * `files` says. `main` and `bin` are read from the manifest with everything
 * else; the rest cannot be, and are the first of two things stated here:
 *
 * - `README*` and `LICENSE*`/`LICENCE*`. `npm pack --dry-run` on this repo lists
 *   exactly README.md and package.json outside `files`; `package.json` is absent
 *   from this list only because it is compared field-by-field below, where
 *   `version` can be excluded. No licence file exists here yet, and `files`
 *   would be the wrong place to notice one appearing — hence globs rather than
 *   filenames, so the commit that adds the first one is the commit that ships it.
 *
 *   `exports` is NOT in that set and is deliberately not derived. npm documents
 *   it as an encapsulation mechanism, not a packing one; its targets ship only
 *   because they sit under `files`. Deriving it would be inventing behaviour npm
 *   does not have.
 *
 *   `:(icase)` is load-bearing, not decoration. npm matches these names without
 *   regard to case, git pathspecs match WITH it, and CI is Linux: a plain
 *   `README*` misses a `readme.md`, and `LICENCE*` misses a `licence.txt`
 *   (verified — the case-sensitive glob returns no match on both). A pathspec
 *   that silently matches nothing is precisely the never-ships failure below.
 * - `.github/workflows/agent.yml` is `on: workflow_call` and consumers pin it
 *   directly (`uses: alandy88/lif-sandcastle/.github/workflows/agent.yml@vX.Y.Z`),
 *   reaching them over a path npm never touches. Deriving this one too would mean
 *   regex-sniffing `workflow_call` out of YAML — a worse trade than one named
 *   entry. `ci.yml` and `release.yml` stay out on purpose: they run here, not
 *   there.
 *
 * `files` entries are npm patterns and these are git pathspecs; the two agree on
 * plain paths and diverge on npm's negation and directory semantics. An entry
 * that is not a plain path throws rather than being passed through, because
 * `git diff` exits 0 on a pathspec that matches nothing: a mistranslated pattern
 * would silently watch NOTHING, which is the never-ships failure this whole gate
 * exists to prevent. Loud is the only safe direction for a rule about coverage.
 */
export function shippedPaths(manifest: {
  files?: unknown;
  main?: unknown;
  bin?: unknown;
}): string[] {
  const plain = (value: unknown, field: string): string => {
    if (typeof value !== "string" || !/^[\w.-]+(\/[\w.-]+)*$/.test(value) || value.includes("..")) {
      throw new Error(
        `\`${field}\` entry ${JSON.stringify(value)} is not a plain path, so it cannot be trusted as a git pathspec`,
      );
    }
    return value;
  };

  const files = manifest.files;
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("package.json has no `files` array to derive the shipped paths from");
  }

  // `bin` is either one path or a map of command name to path; npm packs the
  // targets either way. Absent fields contribute nothing — this repo has neither
  // today, which is exactly why reading them beats waiting to remember them: the
  // manifest edit that adds one ships it, and every later edit to that file
  // would otherwise be invisible here.
  const bins =
    typeof manifest.bin === "string"
      ? [manifest.bin]
      : manifest.bin && typeof manifest.bin === "object"
        ? Object.values(manifest.bin)
        : [];

  return [
    ...files.map((file) => plain(file, "files")),
    ...(manifest.main === undefined ? [] : [plain(manifest.main, "main")]),
    ...bins.map((target) => plain(target, "bin")),
    ":(icase)readme*",
    ":(icase)licen[cs]e*",
    ".github/workflows/agent.yml",
  ];
}

/** A manifest with `version` removed, as a comparable string. */
function comparable(json: Record<string, unknown>): string {
  const { version: _version, ...rest } = json;
  return JSON.stringify(rest);
}

/**
 * Would a consumer installing the next tag receive anything different from
 * `lastTag`?
 *
 * The question is about the installable payload, not about what the commits
 * claimed — `bb2f75a` ("chore: bump routing model ids") changed the model every
 * consumer resolves and a commit-type filter would have shipped nothing for it.
 * So the comparison covers everything that reaches a consumer — `shippedPaths()`
 * (see there for how that set is derived), plus `package.json` itself, because
 * npm runs its scripts when installing a git dependency and so nearly every
 * field can reach a consumer.
 *
 * Only `dist` is staged, and only because it is gitignored on main — that also
 * leaves it staged for the release commit the workflow makes next. Everything
 * else shipped is tracked, so the index already carries whatever the
 * merge did to it, INCLUDING deleting a path outright; naming those in the
 * `add` would instead abort the gate with "pathspec ... did not match any
 * files" on exactly that change.
 *
 * `version` is the one key excluded from the package.json comparison, because
 * it is guaranteed to differ: the tag carries a stamped version and main
 * carries the `0.0.0-development` placeholder, so leaving it in would report
 * every push as changed. Nothing else is excluded — for a git-installed package
 * the bias is deliberately toward releasing.
 *
 * That bias is also why an unreadable tagged `package.json` reads as changed
 * rather than as unchanged: the gate's failure mode should be a tag nobody
 * needed, never a change that never ships.
 */
export async function payloadChanged(
  lastTag: string,
  git: GitRunner = hostGit,
  readPackageJson: ReadPackageJson = readWorkingPackageJson,
): Promise<boolean> {
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(readPackageJson());
  } catch {
    // Same bias as the comparison below: a manifest the gate cannot read has not
    // told it the payload is unchanged.
    return true;
  }
  const paths = shippedPaths(manifest);

  const staged = await git(["add", "-f", "dist"]);
  // Throws rather than resolving false: a gate that cannot read the payload has
  // not found it unchanged. The shell got this from `bash -e`.
  if (staged.exitCode !== 0) {
    throw new Error(
      `staging dist/ for the release gate exited ${staged.exitCode}: ${staged.stderr}`,
    );
  }

  const diff = await git(["diff", "--cached", "--quiet", lastTag, "--", ...paths]);
  if (diff.exitCode !== 0) return true;

  const tagged = await git(["show", `${lastTag}:package.json`]);
  if (tagged.exitCode !== 0) return true;
  try {
    return comparable(JSON.parse(tagged.stdout)) !== comparable(manifest);
  } catch {
    return true;
  }
}

/**
 * `--tags` prints every release tag, newest first, for the publication step to
 * reconcile. Otherwise: the answers the workflow's `check` step publishes.
 */
async function main(): Promise<void> {
  if (process.argv.includes("--tags")) {
    console.log((await releaseTags()).join("\n"));
    return;
  }

  const stale = await headIsStale();

  const lastTag = await lastReleaseTag();
  // Skipped entirely when stale — staging dist/ and diffing it would only
  // produce an answer about superseded code.
  const changed = !stale && (lastTag === null || (await payloadChanged(lastTag)));

  const out = process.env.GITHUB_OUTPUT;
  if (out) appendFileSync(out, `last=${lastTag ?? ""}\nchanged=${changed}\nstale=${stale}\n`);

  const note = stale
    ? "HEAD is not the tip of origin/main — a newer run covers this commit, skipping."
    : lastTag === null
      ? "No release tag yet — releasing."
      : changed
        ? `Installable payload changed since ${lastTag} — releasing.`
        : `Installable payload is unchanged since ${lastTag} — no release.`;
  console.log(note);
  // Only the outcomes that end the release go in the job summary; when a release
  // does happen the "stamp and tag" step writes the line worth reading there,
  // with the tag link in it.
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary && !changed) appendFileSync(summary, `${note}\n`);
}

if (isEntrypoint(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    // `::error::` so a failed gate surfaces as an annotation on the run rather
    // than as a stack trace a reader has to scroll a log to find.
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
