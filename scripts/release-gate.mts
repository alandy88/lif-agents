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
 */
export const TAG_FORM = /^v[0-9]+\.[0-9]+\.[0-9]+$/;

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
 * Compares only; the caller fetches first, so the freshness of `origin/main` is
 * a decision the caller makes rather than a side effect hidden in here.
 */
export async function headIsStale(git: GitRunner = hostGit): Promise<boolean> {
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

/** `package.json` with `version` removed, as a comparable string. */
function shipped(raw: string): string {
  const json = JSON.parse(raw);
  delete json.version;
  return JSON.stringify(json);
}

/**
 * Would a consumer installing the next tag receive anything different from
 * `lastTag`?
 *
 * The question is about the installable payload, not about what the commits
 * claimed — `bb2f75a` ("chore: bump routing model ids") changed the model every
 * consumer resolves and a commit-type filter would have shipped nothing for it.
 * So the comparison covers everything that reaches an installing consumer:
 *
 *   • `dist` and `templates`, which is exactly `package.json`'s `files`.
 *     templates/ matters on its own: `templatePath()` resolves prompts out of
 *     the installed package, so a template edit is as consumer-visible as a
 *     code change and ships with no dist/ diff at all.
 *   • `package.json` itself, because npm runs its scripts when installing a git
 *     dependency, so nearly every field can reach a consumer.
 *
 * Only `dist` is staged, and only because it is gitignored on main — that also
 * leaves it staged for the release commit the workflow makes next. `templates`
 * is tracked, so the index already carries whatever the merge did to it,
 * INCLUDING deleting the directory outright; naming it in the `add` would
 * instead abort the gate with "pathspec 'templates' did not match any files" on
 * exactly that change.
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
  const staged = await git(["add", "-f", "dist"]);
  // Throws rather than resolving false: a gate that cannot read the payload has
  // not found it unchanged. The shell got this from `bash -e`.
  if (staged.exitCode !== 0) {
    throw new Error(
      `staging dist/ for the release gate exited ${staged.exitCode}: ${staged.stderr}`,
    );
  }

  const diff = await git(["diff", "--cached", "--quiet", lastTag, "--", "dist", "templates"]);
  if (diff.exitCode !== 0) return true;

  const tagged = await git(["show", `${lastTag}:package.json`]);
  if (tagged.exitCode !== 0) return true;
  try {
    return shipped(tagged.stdout) !== shipped(readPackageJson());
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

  // Fetched here rather than inside `headIsStale`, which only compares: a run
  // checks out its event SHA, and origin/main as of checkout can already be
  // behind by the time the concurrency lock releases this run.
  await hostGit(["fetch", "--quiet", "origin", "main"]);
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
