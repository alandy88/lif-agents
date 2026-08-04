import assert from "node:assert/strict";
import { test } from "node:test";
import { parseNextTask, taskBranch, taskSlug } from "./state.mts";

test("parses the newest Next task line (entries are newest-first)", () => {
  const stateMd = [
    "# STATE.md — Progress ledger",
    "",
    "## 2026-07-19 — 1.3 Water kit data — DONE",
    "- Next task: **1.4 Nature kit data** (see PLAN.md Phase 1).",
    "",
    "## 2026-07-19 — 1.2 Fire kit data — DONE",
    "- Next task: **1.3 Water kit data** (see PLAN.md Phase 1).",
  ].join("\n");

  assert.deepEqual(parseNextTask(stateMd), {
    label: "1.4 Nature kit data",
    branch: "agent/1-4-nature-kit-data",
  });
});

test("parses a resume-style recommendation from a PARTIAL entry", () => {
  const stateMd =
    "- Next task: **resume 1.2 Fire kit data** after the user rules on the open question.";
  assert.deepEqual(parseNextTask(stateMd), {
    label: "resume 1.2 Fire kit data",
    branch: "agent/resume-1-2-fire-kit-data",
  });
});

test("returns undefined when no recommendation exists", () => {
  assert.equal(parseNextTask("# STATE.md\n\nNo entries yet."), undefined);
  assert.equal(parseNextTask("- Next task: ** **"), undefined);
});

test("slug is bounded and branch-safe", () => {
  assert.equal(
    taskSlug("2.7 Combat resolution & frame timeline!"),
    "2-7-combat-resolution-frame-timeline",
  );
  assert.equal(taskSlug("///"), "task");
  assert.ok(taskSlug("x".repeat(200)).length <= 48);
  assert.equal(taskBranch("1.8 Summons + Lesser Artefacts"), "agent/1-8-summons-lesser-artefacts");
});
