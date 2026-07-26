import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The kit abstracts @ai-hero/sandcastle; a consumer should never name it. That
// holds only if no sandcastle type reaches a preset's public declaration —
// a single `createAgent?: (p) => AgentProvider` in the config interface drags
// the whole dependency back into the consumer's typecheck.
//
// This reads the committed dist/, which is the artifact consumers actually
// resolve. CI's `git diff --exit-code -- dist` is what keeps it honest against
// src; this test is what keeps the boundary honest against both.
const PRESETS = ["implement"];

for (const preset of PRESETS) {
  test(`presets/${preset} exposes no @ai-hero type in its public declaration`, () => {
    const declaration = readFileSync(
      fileURLToPath(new URL(`../../dist/presets/${preset}.d.mts`, import.meta.url)),
      "utf8",
    );
    assert.doesNotMatch(
      declaration,
      /@ai-hero/,
      `${preset}.d.mts names @ai-hero — a consumer typechecking against it would ` +
        `need @ai-hero/sandcastle installed, which the kit exists to hide`,
    );
  });
}

test("@ai-hero/sandcastle is a dependency, not a peer", () => {
  // A peer range is a demand on the consumer's package.json — the same leak one
  // level up from an import. The kit owns the version; consumers pin the kit.
  const manifest = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8"),
  ) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> };

  assert.ok(manifest.dependencies?.["@ai-hero/sandcastle"], "must be a real dependency");
  assert.equal(manifest.peerDependencies?.["@ai-hero/sandcastle"], undefined);
});
