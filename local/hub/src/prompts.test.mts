import assert from "node:assert/strict";
import { test } from "node:test";

import { assemblePrompt, parsePromptSections, slugify } from "./prompts.mts";

const SAMPLE = `# Title

## How the collection is built

\`\`\`
BASE -> MODE -> DOMAIN
\`\`\`

## BASE — always on

\`\`\`text
base line one
base line two
\`\`\`

## MODE — Idea exploration (general)

Goal: think.

\`\`\`text
explore body
\`\`\`

## DOMAIN — Implementation plan / spec: Peter's repos, homelab, workbench

\`\`\`text
domain body
\`\`\`
`;

test("slugify strips dashes, parens, and apostrophes", () => {
  assert.equal(slugify("MODE — Idea exploration (general)"), "mode-idea-exploration-general");
  assert.equal(
    slugify("DOMAIN — Implementation plan / spec: Peter's repos, homelab, workbench"),
    "domain-implementation-plan-spec-peters-repos-homelab-workbench",
  );
});

test("parsePromptSections keeps only ```text blocks under ## headings", () => {
  const { sections } = parsePromptSections(SAMPLE);
  assert.deepEqual([...sections.keys()], [
    "base-always-on",
    "mode-idea-exploration-general",
    "domain-implementation-plan-spec-peters-repos-homelab-workbench",
  ]);
  assert.equal(sections.get("base-always-on"), "base line one\nbase line two");
});

test("assemblePrompt stacks base, mode, domain, then the task", () => {
  const sections = parsePromptSections(SAMPLE);
  const out = assemblePrompt({
    sections,
    baseSection: "base-always-on",
    modeSection: "mode-idea-exploration-general",
    domainSection: "domain-implementation-plan-spec-peters-repos-homelab-workbench",
    task: "  do the thing  ",
  });
  assert.equal(
    out,
    "base line one\nbase line two\n\n---\n\nexplore body\n\n---\n\ndomain body\n\n---\n\n# Task\n\ndo the thing",
  );
});

test("assemblePrompt names the missing section", () => {
  const sections = parsePromptSections(SAMPLE);
  assert.throws(
    () => assemblePrompt({ sections, baseSection: "base-always-on", modeSection: "nope", task: "x" }),
    /section "nope" not found/,
  );
});
