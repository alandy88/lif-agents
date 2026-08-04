import { test } from "node:test";
import assert from "node:assert/strict";
import { defangPromptArgs, defangShellExpansion } from "./defang.mts";

test("defangShellExpansion neutralizes expansion blocks and leaves prose alone", () => {
  // Args are substituted before `!`…`` is expanded, so an un-defanged value
  // reaching review-prompt.md would execute inside the sandbox.
  assert.equal(defangShellExpansion("hit !`id` here"), "hit ! `id` here");
  assert.equal(defangShellExpansion("a !`id` and !`whoami`"), "a ! `id` and ! `whoami`");
  // A plain code span, or a bang that merely precedes one, is untouched.
  assert.equal(defangShellExpansion("use `git diff` — done! `ok`"), "use `git diff` — done! `ok`");
  assert.equal(defangShellExpansion("no expansion at all"), "no expansion at all");
});

test("defangPromptArgs covers every value, whoever authored it", () => {
  const args = defangPromptArgs({
    ISSUE_NUMBER: "42",
    ISSUE_TITLE: "Fix !`cat /etc/passwd`",
    ISSUE_BODY: "Steps:\n1. !`env`",
    BRANCH: "sandcastle/issue-42",
  });

  assert.deepEqual(args, {
    ISSUE_NUMBER: "42",
    ISSUE_TITLE: "Fix ! `cat /etc/passwd`",
    ISSUE_BODY: "Steps:\n1. ! `env`",
    BRANCH: "sandcastle/issue-42",
  });
});
