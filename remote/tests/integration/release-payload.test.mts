// The release gate's payload comparison, against real repos built the way
// release.yml builds one. Every case here is a thing git decides, not a thing
// our code decides: whether a gitignored dist/ is diffable at all, what a
// pathspec does when the directory it names has been deleted, and what the
// index carries for a tracked path versus an ignored one. That is precisely the
// class of question the shell version of this gate kept getting wrong, and a
// mocked `git` would have agreed with every one of those wrong answers.
//
// Each test gets its own repo: `payloadChanged` stages remote/dist/, so it mutates the
// index it reads.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { payloadChanged } from "../../scripts/release-gate.mts";
import { gitIn, makeTempRoot, must, removeTempRoot } from "./helpers.mts";

const root = makeTempRoot();
after(() => removeTempRoot(root));

const PLACEHOLDER = "0.0.0-development";
const TAG = "v0.1.0";

/** `extra` is for the fields only one test needs — a `bin`, a `main`. */
const manifest = (version: string, extra: Record<string, unknown> = {}) =>
  `${JSON.stringify(
    {
      name: "@lif/sandcastle-kit",
      version,
      files: ["remote/dist", "remote/templates"],
      scripts: { build: "tsc -p tsconfig.json" },
      ...extra,
    },
    null,
    2,
  )}\n`;

function write(repo: string, path: string, body: string): void {
  const full = join(repo, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, body);
}

/** remote/dist/ as a fresh `npm run build` would leave it — same bytes every time. */
function build(repo: string): void {
  write(repo, "remote/dist/index.mjs", "export const kit = 1;\n");
}

/**
 * A repo mid-release-run: one release tag carrying dist/ and a stamped version,
 * main sitting one commit back with the placeholder, and a rebuilt dist/ in the
 * worktree. The tag is an unmerged child of main, exactly as release.yml cuts it.
 */
async function releasedRepo(
  name: string,
  extra: Record<string, unknown> = {},
  seed: Record<string, string> = {},
): Promise<string> {
  const repo = join(root, name);
  await must(gitIn(root), ["init", "-b", "main", repo]);
  const git = gitIn(repo);

  write(repo, ".gitignore", "remote/dist/\n");
  write(repo, "package.json", manifest(PLACEHOLDER, extra));
  // Files a single test needs to exist BEFORE the tag, so that test can edit
  // one and be asking about an edit rather than about an addition.
  for (const [path, body] of Object.entries(seed)) write(repo, path, body);
  write(repo, "remote/templates/agent.md", "# agent\n");
  // Outside `files`, but npm packs it anyway — see shippedPaths().
  write(repo, "README.md", "# kit\n");
  // Outside `files`, but consumers pin it directly by tag — see shippedPaths().
  write(repo, ".github/workflows/agent.yml", "on:\n  workflow_call:\n");
  await must(git, ["add", "-A"]);
  await must(git, ["commit", "-m", "main: the state a release is cut from"]);

  const mainTip = (await must(git, ["rev-parse", "HEAD"])).stdout.trim();
  build(repo);
  write(repo, "package.json", manifest("0.1.0", extra));
  await must(git, ["add", "-f", "remote/dist", "package.json"]);
  await must(git, ["commit", "-m", "release v0.1.0: stamp version, build remote/dist/"]);
  await must(git, ["tag", TAG]);
  await must(git, ["reset", "--hard", mainTip]); // main never carries the release commit
  build(repo); // the reset removed dist/; CI arrives with a fresh build instead
  return repo;
}

const changed = (repo: string) =>
  payloadChanged(TAG, gitIn(repo), () => readFileSync(join(repo, "package.json"), "utf8"));

test("a rebuilt but identical payload is unchanged — the stamp is not a diff", async () => {
  // The tag says 0.1.0 and main says 0.0.0-development, always. Comparing
  // package.json whole would report every single push as a release.
  const repo = await releasedRepo("identical");
  assert.equal(await changed(repo), false);
});

test("a dist/ change is seen even though dist/ is gitignored", async () => {
  // Nothing about dist/ is in the index until the gate force-stages it, and an
  // unstaged ignored path is invisible to `git diff --cached`. This is the whole
  // reason the gate writes to the index before it reads a diff.
  const repo = await releasedRepo("dist-changed");
  write(repo, "remote/dist/index.mjs", "export const kit = 2;\n");
  assert.equal(await changed(repo), true);
});

test("a templates/ change is seen with no dist/ diff at all", async () => {
  // templatePath() resolves prompts out of the installed package, so a prompt
  // edit reaches consumers without the built output moving a byte. A gate that
  // only watched dist/ would ship nothing for it.
  const repo = await releasedRepo("templates-changed");
  write(repo, "remote/templates/agent.md", "# agent, revised\n");
  await must(gitIn(repo), ["add", "-A"]);
  assert.equal(await changed(repo), true);
});

test("deleting templates/ outright reads as changed, and does not abort the gate", async () => {
  // The failure this guards: naming `remote/templates` in the `git add` aborts with
  // "pathspec 'remote/templates' did not match any files" on exactly this change, so
  // the one commit that removes a whole shipped directory would fail the gate
  // instead of releasing. It is tracked, so the index already has the deletion.
  const repo = await releasedRepo("templates-deleted");
  await must(gitIn(repo), ["rm", "-r", "remote/templates"]);
  assert.equal(await changed(repo), true);
});

test("a reusable-workflow change is a change, though npm never ships it", async () => {
  // `.github/workflows/agent.yml` is `on: workflow_call` and consumers pin it
  // as `uses: .../agent.yml@vX.Y.Z`, so it reaches them over a path npm never
  // touches and is absent from `files`. Judged by the npm payload alone, a fix
  // to it would sit on main until some unrelated change happened to cut a tag.
  const repo = await releasedRepo("workflow-changed");
  write(repo, ".github/workflows/agent.yml", "on:\n  workflow_call:\n    inputs:\n      issue:\n");
  await must(gitIn(repo), ["add", "-A"]);
  assert.equal(await changed(repo), true);
});

test("a README edit is a change, because npm packs it whatever `files` says", async () => {
  // Verified with `npm pack --dry-run`: the tarball carries exactly README.md
  // and package.json outside `files`. It ships, so it is watched — the cost is
  // that a doc-only commit cuts a patch, which is the cheap side of this gate's
  // bias.
  const repo = await releasedRepo("readme-changed");
  write(repo, "README.md", "# kit, documented\n");
  await must(gitIn(repo), ["add", "-A"]);
  assert.equal(await changed(repo), true);
});

test("adding the first LICENSE is a change, though nothing else moved", async () => {
  // npm packs LICENSE whatever `files` says, so the commit that adds one ships
  // it. There is no licence file in this repo yet, which is exactly why the
  // shipped set carries a glob rather than a filename — a list of names could
  // only be updated after someone noticed the omission.
  const repo = await releasedRepo("licence-added");
  write(repo, "LICENSE", "MIT\n");
  await must(gitIn(repo), ["add", "-A"]);
  assert.equal(await changed(repo), true);
});

test("the always-packed globs ignore case, because npm does and git does not", async () => {
  // CI is Linux, so pathspecs match case-sensitively while npm matches these
  // names without regard to case. A plain `README*` misses `readme.md` and
  // `LICENCE*` misses `licence.txt` — a pathspec matching nothing is silent,
  // which is the never-ships failure this gate exists to prevent.
  const repo = await releasedRepo("lowercase-always-packed");
  write(repo, "licence.txt", "MIT\n");
  await must(gitIn(repo), ["add", "-A"]);
  assert.equal(await changed(repo), true);
});

test("an edit to a bin target outside `files` is a change", async () => {
  // The manifest edit that ADDS a bin is caught by the package.json comparison
  // for one release. Every later edit to the file it points at is not — the
  // target sits outside `files`, so nothing else would ever notice it move. npm
  // packs main and bin regardless of `files`, so both are read from the manifest
  // with everything else.
  const repo = await releasedRepo(
    "bin-changed",
    { bin: { kit: "bin/kit.mjs" } },
    { "bin/kit.mjs": "#!/usr/bin/env node\nrun();\n" },
  );
  write(repo, "bin/kit.mjs", "#!/usr/bin/env node\nrun({ fixed: true });\n");
  await must(gitIn(repo), ["add", "-A"]);
  assert.equal(await changed(repo), true);
});

test("a package.json field other than version is a change", async () => {
  // npm runs a git dependency's scripts on install, so a build script edit
  // reaches consumers even when dist/ and templates/ are byte-identical.
  const repo = await releasedRepo("manifest-changed");
  const current = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
  current.scripts.build = "tsc -p tsconfig.build.json";
  write(repo, "package.json", `${JSON.stringify(current, null, 2)}\n`);
  assert.equal(await changed(repo), true);
});

test("an unreadable tagged package.json releases rather than silently skipping", async () => {
  // The bias for a git-installed package is toward releasing: a tag nobody
  // needed is recoverable, a change that never ships is the failure mode this
  // whole gate exists for.
  const repo = await releasedRepo("no-tag-manifest");
  assert.equal(await payloadChanged("v9.9.9", gitIn(repo), () => manifest(PLACEHOLDER)), true);
});

test("a payload the gate cannot stage throws instead of reading as unchanged", async () => {
  // `git add` failing is not evidence that nothing changed, and resolving false
  // there would silently strand every later release.
  const repo = await releasedRepo("unstageable");
  rmSync(join(repo, ".git"), { recursive: true, force: true, maxRetries: 5 });
  await assert.rejects(() => changed(repo), /staging remote\/dist\//);
});
