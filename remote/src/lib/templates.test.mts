import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { templatePath } from "./templates.mts";

// Pretend the kit is installed at <root>/node_modules/@lif/sandcastle-kit by
// treating the repo root's grandparent as the workspace.
const kitRoot = fileURLToPath(new URL("../../", import.meta.url));
const workspaceRoot = path.resolve(kitRoot, "..");

test("returns a workspace-relative posix path", () => {
  const result = templatePath("implement/task-prompt.md", { workspaceRoot });
  assert.ok(!path.isAbsolute(result));
  assert.ok(!result.includes("\\"));
  assert.ok(result.endsWith("/templates/implement/task-prompt.md"));
});

test("throws when the kit resolves outside the workspace", () => {
  assert.throws(
    () => templatePath("implement/task-prompt.md", { workspaceRoot: path.join(kitRoot, "src") }),
    /outside the workspace/,
  );
});

test("prefers an existing repo override over the kit default", () => {
  const result = templatePath("templates.mts", {
    workspaceRoot: kitRoot,
    overrideDir: "src/lib",
  });
  assert.equal(result, "src/lib/templates.mts");
});
