import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The kit abstracts @ai-hero/sandcastle; a consumer should never name it. That
// holds only if no sandcastle type reaches a preset's public declaration —
// a single `createAgent?: (p) => AgentProvider` in the config interface drags
// the whole dependency back into the consumer's typecheck.
//
// This reads remote/dist/, which is the artifact consumers actually resolve. remote/dist/
// is gitignored on main (release tags carry it); it exists at test time
// because ci.yml runs `bun run build` before `bun run test` — and locally because
// `bun install`'s prepare script runs tsc.
//
// Phases are covered too: a Layer-4 consumer composes them directly (that is the
// whole point of the layer), so a sandcastle type in `PhaseContext` would leak
// exactly as far as one in a preset config. `lib/run.mts` is covered for the same
// reason one level down: both presets name `RepoConfig` and `RunDeps` from it, so
// a sandcastle type there reaches a consumer through their declarations.
const DECLARATIONS = [
  "lib/run.d.mts",
  "presets/implement.d.mts",
  "presets/task/index.d.mts",
  "presets/task/state.d.mts",
  "phases/context.d.mts",
  "phases/plan.d.mts",
  "phases/task.d.mts",
  "phases/review.d.mts",
  "phases/verify.d.mts",
  // lib/ is not blanket-covered — lib/provider-setup.mts legitimately names
  // @ai-hero types — but github-pr.mts carries none and kept the assertion it
  // had as a phase.
  "lib/github-pr.d.mts",
];

for (const file of DECLARATIONS) {
  test(`${file} exposes no @ai-hero type in its public declaration`, () => {
    const declaration = readFileSync(
      fileURLToPath(new URL(`../../dist/${file}`, import.meta.url)),
      "utf8",
    );
    assert.doesNotMatch(
      declaration,
      /@ai-hero/,
      `${file} names @ai-hero — a consumer typechecking against it would ` +
        `need @ai-hero/sandcastle installed, which the kit exists to hide`,
    );
  });
}

test("@ai-hero/sandcastle is a dependency, not a peer", () => {
  // A peer range is a demand on the consumer's package.json — the same leak one
  // level up from an import. The kit owns the version; consumers pin the kit.
  const manifest = JSON.parse(
    // ../../.. — the manifest stays at the repo root, one level above remote/.
    readFileSync(fileURLToPath(new URL("../../../package.json", import.meta.url)), "utf8"),
  ) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> };

  assert.ok(manifest.dependencies?.["@ai-hero/sandcastle"], "must be a real dependency");
  assert.equal(manifest.peerDependencies?.["@ai-hero/sandcastle"], undefined);
});
