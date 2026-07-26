import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Issue } from "../lib/github-issue.mts";
import { type Admission, type IntakeRequest } from "../lib/issue-intake.mts";
import {
  main,
  NO_NOTES_PLACEHOLDER,
  parseCli,
  renderNotes,
  renderPrBody,
  type MainDeps,
} from "./implement.mts";
import { MIXED_PROFILE_NAME, resolvePhases } from "../lib/profiles.mts";

function makeDeps(overrides: {
  admission?: Admission;
}): MainDeps & { comments: string[]; ran: boolean; requests: IntakeRequest[] } {
  const issue: Issue = {
    title: "Fix the widget",
    body: "It is broken.",
    state: "OPEN",
    labels: ["ready-for-agent"],
  };
  const admission: Admission = overrides.admission ?? {
    kind: "admitted",
    issue,
    run: resolvePhases({ labels: ["agent:claude"] }),
  };
  const state = {
    comments: [] as string[],
    requests: [] as IntakeRequest[],
    ran: false,
  };
  return {
    comments: state.comments,
    requests: state.requests,
    get ran() {
      return state.ran;
    },
    issueSource: {
      getIssue: async () => issue,
      comment: async (_issueNumber, body) => {
        state.comments.push(body);
      },
      setBody: async () => {},
    },
    admit: async (request) => {
      state.requests.push(request);
      return admission;
    },
    runIssue: async () => {
      state.ran = true;
      return { prUrl: "https://example.test/pr/1" };
    },
    env: {},
  };
}

test("parseCli requires a positive issue number", () => {
  assert.throws(() => parseCli([]), /--issue must be a positive/);
  assert.throws(() => parseCli(["--issue", "abc"]), /--issue must be a positive/);
  assert.throws(() => parseCli(["--issue", "42", "--verbose"]), /unknown flag --verbose/);
  assert.deepEqual(parseCli(["--issue", "42", "--profile", "claude", "--trigger", "issues"]), {
    issue: 42,
    profile: "claude",
    model: undefined,
    trigger: "issues",
  });
});

// `admit` is faked in every test here, so nothing else observes the request it
// is handed. Distinct values per field, so a crossed wire fails rather than
// coincidentally matching.
test("the intake request is built from the CLI options and the environment", async () => {
  const deps = makeDeps({});
  deps.env.AGENT_DEFAULT_PROFILE = "from-env";
  await main(
    { issue: 7, trigger: "from-trigger", profile: "from-profile", model: "from-model" },
    deps,
  );
  assert.deepEqual(deps.requests, [
    {
      issueNumber: 7,
      trigger: "from-trigger",
      dispatchProfile: "from-profile",
      modelOverride: "from-model",
      defaultProfile: "from-env",
    },
  ]);
});

test("a rejected verdict is reported on the issue and its cause rethrown", async () => {
  const deps = makeDeps({
    admission: { kind: "rejected", detail: "nope", cause: new Error("raw reason") },
  });
  await assert.rejects(main({ issue: 7 }, deps), /raw reason/);
  assert.equal(deps.comments.length, 1);
  assert.equal(deps.comments[0], "nope");
  assert.equal(deps.ran, false);
});

test("a skipped verdict returns cleanly", async () => {
  const deps = makeDeps({ admission: { kind: "skipped", reason: "queued label gone" } });
  const result = await main({ issue: 7 }, deps);
  assert.equal(result, "skipped");
  assert.equal(deps.comments.length, 0);
  assert.equal(deps.ran, false);
});

test("renderNotes states the empty case instead of leaving a blank block", () => {
  assert.equal(renderNotes(""), NO_NOTES_PLACEHOLDER);
  assert.equal(renderNotes("   \n\n  "), NO_NOTES_PLACEHOLDER);
  assert.equal(
    renderNotes("\n## Deviations\n\n- **Task 1: x** — chose y.\n\n"),
    "## Deviations\n\n- **Task 1: x** — chose y.",
  );
});

test("renderPrBody carries the review summary under the issue link", () => {
  const run = resolvePhases({ labels: ["agent:claude"] });
  const body = renderPrBody(7, run, "### What changed\n\nThe widget now closes.\n");
  assert.match(body, /^Closes #7\./);
  assert.match(body, /Automated sandcastle-agent run \(claude → /);
  assert.match(body, /### What changed\n\nThe widget now closes\.$/);
});

test("renderPrBody flags a missing summary rather than posting a bare one-liner", () => {
  const run = resolvePhases({});
  assert.equal(run.name, MIXED_PROFILE_NAME);
  const body = renderPrBody(7, run, "   ");
  assert.match(body, /left no AGENT_SUMMARY\.md/);
  assert.match(body, /has not been summarized/);
});

test("the happy path runs and reports the PR on the issue", async () => {
  const deps = makeDeps({});
  const result = await main({ issue: 7, trigger: "issues" }, deps);
  assert.equal(result, "ran");
  assert.equal(deps.ran, true);
  assert.equal(deps.comments.length, 1);
  assert.match(deps.comments[0]!, /https:\/\/example.test\/pr\/1/);
});

// The templates and the promptArgs maps in runIssue are two halves of one
// contract with no compiler between them: a `{{ARG}}` the preset never supplies
// reaches the agent as a literal `{{ARG}}`, which reads as a corrupted prompt
// rather than an error. Pin the per-phase arg sets against the shipped defaults.
const BASE_ARGS = ["ISSUE_NUMBER", "ISSUE_TITLE", "BRANCH", "CONVENTIONS"];
const SUPPLIED: Record<string, string[]> = {
  "plan-prompt.md": [...BASE_ARGS, "ISSUE_BODY"],
  "task-prompt.md": [
    ...BASE_ARGS,
    "ISSUE_BODY",
    "NOTES",
    "TASK_INDEX",
    "TASK_COUNT",
    "TASK_TEXT",
    "TASK_LIST",
  ],
  "review-prompt.md": [...BASE_ARGS, "ISSUE_BODY", "NOTES"],
};

for (const [file, supplied] of Object.entries(SUPPLIED)) {
  test(`every {{ARG}} in the default ${file} is supplied by the preset`, () => {
    const source = readFileSync(
      fileURLToPath(new URL(`../../templates/implement/${file}`, import.meta.url)),
      "utf8",
    );
    const used = new Set(
      [...source.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((match) => match[1]!),
    );
    const missing = [...used].filter((name) => !supplied.includes(name));
    assert.deepEqual(missing, [], `unsupplied placeholders in ${file}`);
  });
}

test("the default templates no longer name a repo toolchain", () => {
  // The whole point of {{CONVENTIONS}}: a kit default that says `uv run` has
  // silently made every consumer a Python repo.
  for (const file of Object.keys(SUPPLIED)) {
    const source = readFileSync(
      fileURLToPath(new URL(`../../templates/implement/${file}`, import.meta.url)),
      "utf8",
    );
    assert.doesNotMatch(source, /\buv run\b|\bpytest\b|\bpre-commit\b/, file);
  }
});
