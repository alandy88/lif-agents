import { test } from "node:test";
import assert from "node:assert/strict";
import { forwardedEnvKeys, phaseProfiles, resolvePhases, resolveProfile } from "./profiles.mts";

test("defaults to the claude profile with no input", () => {
  const profile = resolveProfile();
  assert.equal(profile.name, "claude");
  assert.equal(profile.provider, "claude");
});

test("routes via the agent:gpt label", () => {
  const profile = resolveProfile({ labels: ["ready-for-agent", "agent:gpt"] });
  assert.equal(profile.name, "gpt");
  assert.equal(profile.provider, "codex");
});

test("ignores non-routing agent labels", () => {
  const profile = resolveProfile({ labels: ["agent:in-progress"] });
  assert.equal(profile.name, "claude");
});

test("rejects unknown agent labels", () => {
  assert.throws(() => resolveProfile({ labels: ["agent:mystery"] }), /Unknown agent label/);
});

test("rejects conflicting agent labels", () => {
  assert.throws(
    () => resolveProfile({ labels: ["agent:claude", "agent:gpt"] }),
    /multiple agent labels/,
  );
});

test("dispatch override wins over labels, even unknown ones", () => {
  const profile = resolveProfile({ labels: ["agent:mystery"], dispatchProfile: "gpt" });
  assert.equal(profile.name, "gpt");
});

test("dispatch value 'default' falls through to labels", () => {
  const profile = resolveProfile({ labels: ["agent:gpt"], dispatchProfile: "default" });
  assert.equal(profile.name, "gpt");
});

test("resolveProfile rejects the phase-only 'mixed' dispatch value", () => {
  assert.throws(
    () => resolveProfile({ dispatchProfile: "mixed" }),
    /Unknown workflow profile "mixed"/,
  );
});

test("rejects an unknown dispatch profile", () => {
  assert.throws(() => resolveProfile({ dispatchProfile: "qwen" }), /Unknown workflow profile/);
});

test("applies a plausible model override", () => {
  const profile = resolveProfile({ modelOverride: "claude-opus-4-8" });
  assert.equal(profile.model, "claude-opus-4-8");
});

test("rejects a model override that doesn't match the provider", () => {
  assert.throws(
    () => resolveProfile({ dispatchProfile: "gpt", modelOverride: "claude-opus-4-8" }),
    /does not look like a codex model id/,
  );
});

test("forwarded env keys are scoped to the providers in use", () => {
  // Both auth modes per provider: the bare token the CLI reads itself, and the
  // `<cli> login` credentials blob providerPreflight materializes to disk.
  assert.deepEqual(forwardedEnvKeys([resolveProfile({ dispatchProfile: "claude" })]), [
    "GH_TOKEN",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "CLAUDE_CREDENTIALS_JSON",
  ]);
  assert.deepEqual(forwardedEnvKeys([resolveProfile({ dispatchProfile: "gpt" })]), [
    "GH_TOKEN",
    "OPENAI_API_KEY",
    "CODEX_AUTH_JSON",
  ]);
  assert.deepEqual(forwardedEnvKeys(Object.values(phaseProfiles)), [
    "GH_TOKEN",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "CLAUDE_CREDENTIALS_JSON",
    "OPENAI_API_KEY",
    "CODEX_AUTH_JSON",
  ]);
});

test("resolvePhases defaults to the mixed phase map", () => {
  const run = resolvePhases({ labels: ["ready-for-agent"] });
  assert.equal(run.name, "mixed");
  assert.equal(run.phases.plan.model, "claude-opus-4-8");
  assert.equal(run.phases.task.model, "gpt-5.6-sol");
  assert.equal(run.phases.review.model, "claude-opus-4-8");
});

test("resolvePhases: a routing label forces every phase onto that profile", () => {
  const run = resolvePhases({ labels: ["ready-for-agent", "agent:claude"] });
  assert.equal(run.name, "claude");
  assert.equal(run.phases.plan.model, "claude-sonnet-4-6");
  assert.equal(run.phases.task.model, "claude-sonnet-4-6");
  assert.equal(run.phases.review.model, "claude-sonnet-4-6");
});

test("resolvePhases: dispatch 'mixed' overrides labels", () => {
  const run = resolvePhases({ labels: ["agent:gpt"], dispatchProfile: "mixed" });
  assert.equal(run.name, "mixed");
});

test("resolvePhases: a named default profile still forces a single-profile run", () => {
  const run = resolvePhases({ defaultProfile: "gpt" });
  assert.equal(run.name, "gpt");
  assert.equal(run.phases.plan.model, "gpt-5.4");
});

test("resolvePhases: label routing errors fail closed", () => {
  assert.throws(() => resolvePhases({ labels: ["agent:mystery"] }), /Unknown agent label/);
  assert.throws(
    () => resolvePhases({ labels: ["agent:claude", "agent:gpt"] }),
    /multiple agent labels/,
  );
});

test("resolvePhases: a model override on a mixed run is rejected", () => {
  assert.throws(() => resolvePhases({ modelOverride: "gpt-5.6-sol" }), /requires a named profile/);
});

test("resolvePhases: a model override applies to a forced single profile", () => {
  const run = resolvePhases({ labels: ["agent:gpt"], modelOverride: "gpt-5.6-luna" });
  assert.equal(run.phases.task.model, "gpt-5.6-luna");
});
