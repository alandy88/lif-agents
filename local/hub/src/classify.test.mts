import assert from "node:assert/strict";
import { test } from "node:test";

import { applyOverrides, buildClassifierPrompt, parseClassification } from "./classify.mts";
import type { Profiles } from "./classify.mts";

const profiles: Profiles = {
  promptsFile: "x",
  repoIndex: "y",
  baseSection: "base",
  defaultRepo: "lif-notes",
  agent: "claude",
  classifierModel: "m",
  modes: {
    explore: { section: "s1", describe: "think", domains: { software: { section: "d1", describe: "sw" } } },
    exec: { section: "s2", describe: "do", domains: { coding: { section: "d2", describe: "code" } } },
  },
};
const repos = ["lif-notes", "lif-studio"];

test("buildClassifierPrompt lists modes, domains, repos, and the message", () => {
  const p = buildClassifierPrompt(profiles, repos, "| lif-studio | platform |", "fix the thing");
  assert.match(p, /- explore: think/);
  assert.match(p, /- software: sw/);
  assert.match(p, /- lif-studio/);
  assert.match(p, /\| lif-studio \| platform \|/);
  assert.match(p, /fix the thing$/);
});

test("parseClassification accepts JSON wrapped in prose", () => {
  const c = parseClassification(
    'Sure: {"mode":"exec","domain":"coding","repo":"lif-studio","title":"Fix The Thing!"} done',
    profiles,
    repos,
  );
  assert.deepEqual(c, { mode: "exec", domain: "coding", repo: "lif-studio", title: "fix-the-thing" });
});

test("parseClassification rejects a domain the mode lacks", () => {
  assert.throws(
    () => parseClassification('{"mode":"exec","domain":"software","repo":"lif-notes","title":"a-b"}', profiles, repos),
    /domain "software"/,
  );
});

test("parseClassification rejects unknown mode and repo", () => {
  assert.throws(() => parseClassification('{"mode":"zzz","repo":"lif-notes","title":"a-b"}', profiles, repos), /unknown mode/);
  assert.throws(() => parseClassification('{"mode":"exec","repo":"other","title":"a-b"}', profiles, repos), /unknown repo/);
});

test("parseClassification trims an overlong title to five words", () => {
  const c = parseClassification(
    '{"mode":"exec","domain":null,"repo":"lif-notes","title":"one two three four five six seven"}',
    profiles,
    repos,
  );
  assert.equal(c.title, "one-two-three-four-five");
});

test("applyOverrides drops a domain that no longer fits the new mode", () => {
  const base = { mode: "exec", domain: "coding", repo: "lif-notes", title: "t-t" };
  const c = applyOverrides(base, { mode: "explore" }, profiles, repos);
  assert.equal(c.mode, "explore");
  assert.equal(c.domain, null);
});

test("applyOverrides validates domain and repo", () => {
  const base = { mode: "exec", domain: null, repo: "lif-notes", title: "t-t" };
  assert.throws(() => applyOverrides(base, { domain: "software" }, profiles, repos), /no domain "software"/);
  assert.throws(() => applyOverrides(base, { repo: "nope" }, profiles, repos), /unknown repo/);
  assert.equal(applyOverrides(base, { domain: "none", repo: "lif-studio" }, profiles, repos).repo, "lif-studio");
});
