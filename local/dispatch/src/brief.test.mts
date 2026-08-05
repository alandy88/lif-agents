import { test } from "node:test";
import assert from "node:assert/strict";

import { parseContractMode, renderBrief } from "./brief.mts";
import type { BriefInput } from "./brief.mts";
import type { Mode } from "./types.mts";

const WORKTREE = "D:\\lif-worktrees\\lif-agents-dispatch-a1b2";

function input(mode: Mode): BriefInput {
  return {
    task: "Add a --dry-run flag to the collect command.",
    project: "lif-agents",
    worktree: WORKTREE,
    branch: "worktree-dispatch",
    mode,
    taskId: "lif-agents-dispatch-a1b2",
  };
}

test("renderBrief embeds the contract line on its own line", () => {
  const lines = renderBrief(input("pr")).split("\n");
  assert.ok(lines.includes("Delivery contract: mode=pr"));
});

test("renderBrief embeds the worktree isolation assertion", () => {
  const brief = renderBrief(input("local"));
  assert.ok(brief.includes("git rev-parse --show-toplevel"));
  assert.ok(brief.includes(WORKTREE));
  assert.ok(brief.includes("blocked"));
  // Shell-agnostic on purpose (PRD §5.4): pwd -P does not exist in pwsh.
  assert.ok(!brief.includes("pwd -P"));
});

test("renderBrief states the task and mode-specific definition of done", () => {
  const pr = renderBrief(input("pr"));
  assert.ok(pr.includes("Add a --dry-run flag to the collect command."));
  assert.ok(/open a pull request/i.test(pr));

  const local = renderBrief(input("local"));
  assert.ok(/do not open a pull request/i.test(local));
});

test("parseContractMode round-trips through renderBrief", () => {
  for (const mode of ["pr", "local"] as const) {
    assert.equal(parseContractMode(renderBrief(input(mode))), mode);
  }
});

test("parseContractMode tolerates surrounding whitespace", () => {
  assert.equal(parseContractMode("intro\n\t Delivery contract: mode=local  \noutro\n"), "local");
  assert.equal(parseContractMode("Delivery contract: mode=pr\r\n"), "pr");
});

test("parseContractMode rejects an unknown mode", () => {
  assert.equal(parseContractMode("Delivery contract: mode=banana\n"), undefined);
});

test("parseContractMode rejects a malformed line", () => {
  assert.equal(parseContractMode("Delivery contract: mode = pr\n"), undefined);
  assert.equal(parseContractMode("delivery contract: mode=pr\n"), undefined);
  assert.equal(parseContractMode("Delivery contract: mode=pr now\n"), undefined);
});

test("parseContractMode returns undefined when the line was deleted", () => {
  const stripped = renderBrief(input("pr"))
    .split("\n")
    .filter((line) => !line.startsWith("Delivery contract:"))
    .join("\n");
  assert.equal(parseContractMode(stripped), undefined);
});

test("parseContractMode refuses a brief carrying two disagreeing contracts", () => {
  assert.equal(parseContractMode("Delivery contract: mode=pr\nDelivery contract: mode=local\n"), undefined);
});
