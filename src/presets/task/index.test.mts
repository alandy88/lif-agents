import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { main, nextTaskFromLedger, parseCli, type MainDeps } from "./index.mts";
import type { NextTask } from "./state.mts";

function makeDeps(
  overrides: { nextTask?: NextTask; syncMain?: boolean } = {},
): MainDeps & { iterations: NextTask[] } {
  const iterations: NextTask[] = [];
  return {
    iterations,
    syncMain: async () => overrides.syncMain ?? true,
    nextTask: () =>
      overrides.nextTask ?? { label: "1.4 Nature kit data", branch: "agent/1-4-nature-kit-data" },
    runIteration: async (_run, next) => {
      iterations.push(next);
      return { prUrl: `https://example.test/pr/${iterations.length}` };
    },
    log: () => {},
  };
}

test("parseCli defaults to one iteration and rejects an out-of-range count", () => {
  assert.deepEqual(parseCli([]), {
    iterations: 1,
    task: undefined,
    profile: undefined,
    model: undefined,
  });
  assert.throws(() => parseCli(["--iterations", "0"]), /between 1 and 20/);
  assert.throws(() => parseCli(["--iterations", "21"]), /between 1 and 20/);
  assert.throws(() => parseCli(["--iterations", "many"]), /between 1 and 20/);
  assert.deepEqual(parseCli(["--iterations", "3", "--task", "1.4 Nature", "--profile", "claude"]), {
    iterations: 3,
    task: "1.4 Nature",
    profile: "claude",
    model: undefined,
  });
});

test("an explicit --task pins only the first iteration; the rest follow the ledger", async () => {
  const deps = makeDeps();
  const prUrls = await main({ iterations: 3, task: "2.1 RNG" }, deps);

  assert.equal(prUrls.length, 3);
  assert.deepEqual(deps.iterations[0], { label: "2.1 RNG", branch: "agent/2-1-rng" });
  assert.deepEqual(deps.iterations[1]!.label, "1.4 Nature kit data");
  assert.deepEqual(deps.iterations[2]!.label, "1.4 Nature kit data");
});

test("a main that will not fast-forward stops the loop before any work", async () => {
  const deps = makeDeps({ syncMain: false });
  await assert.rejects(main({ iterations: 2 }, deps), /resolve main before looping/);
  assert.deepEqual(deps.iterations, []);
});

test("a malformed ledger stops the loop rather than guessing a task", () => {
  assert.throws(() => nextTaskFromLedger("# STATE.md\n\nNo entries yet."), /fix the ledger/);
  assert.deepEqual(nextTaskFromLedger("- Next task: **2.1 RNG**"), {
    label: "2.1 RNG",
    branch: "agent/2-1-rng",
  });
});

test("an unknown profile is rejected before the first sandbox is built", async () => {
  const deps = makeDeps();
  await assert.rejects(main({ iterations: 1, profile: "gemini" }, deps), /Unknown workflow profile/);
  assert.deepEqual(deps.iterations, []);
});

test("a model override without a named profile is rejected", async () => {
  const deps = makeDeps();
  await assert.rejects(main({ iterations: 1, model: "gpt-5.6" }, deps), /requires a named profile/);
  assert.deepEqual(deps.iterations, []);
});

// Same contract the implement preset's templates are held to: a `{{ARG}}` the
// preset never supplies reaches the agent as a literal `{{ARG}}`, which reads as
// a corrupted prompt rather than an error.
const SUPPLIED = ["BRANCH", "TASK_LABEL", "CONVENTIONS", "VERIFY"];
const TEMPLATES = ["task-prompt.md", "verify-prompt.md"];

function templateSource(file: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../templates/task/${file}`, import.meta.url)), "utf8");
}

for (const file of TEMPLATES) {
  test(`every {{ARG}} in the default task/${file} is supplied by the preset`, () => {
    const used = new Set([...templateSource(file).matchAll(/\{\{([A-Z_]+)\}\}/g)].map((m) => m[1]!));
    const missing = [...used].filter((name) => !SUPPLIED.includes(name));
    assert.deepEqual(missing, [], `unsupplied placeholders in ${file}`);
  });
}

test("the ledger templates name no package manager or test runner", () => {
  // The donor's prompts said `dotnet build` and `dotnet test` outright, which
  // would have made every consumer of this preset a .NET repo.
  for (const file of TEMPLATES) {
    assert.doesNotMatch(
      templateSource(file),
      /\bdotnet\b|\buv run\b|\bpytest\b|\bpre-commit\b|\bnpm\b|\byarn\b|\bpnpm\b|\bcargo\b/,
      file,
    );
  }
});
