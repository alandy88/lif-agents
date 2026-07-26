import { test } from "node:test";
import assert from "node:assert/strict";
import { renderConventions, toolchains, type Toolchain } from "./toolchains.mts";

const ALL = Object.keys(toolchains) as Toolchain[];

test("every toolchain declares warm-up, a test command, and conventions", () => {
  for (const name of ALL) {
    const spec = toolchains[name];
    assert.ok(spec.preflight.length > 0, `${name} has no preflight`);
    assert.ok(spec.test.length > 0, `${name} has no test command`);
    assert.ok(spec.conventions.includes(spec.test), `${name} omits its own test command`);
  }
});

test("the toolchain standard is what reaches the prompt", () => {
  // The point of the enum: choosing python IS choosing uv. A repo cannot get a
  // conventions block that tells an agent to run bare `pytest`.
  assert.match(renderConventions("python"), /uv run python -m pytest/);
  assert.doesNotMatch(renderConventions("python"), /(?<!uv run )(?<!-m )\bpytest\b/);
  assert.match(renderConventions("node"), /npm test/);
  assert.match(renderConventions("dotnet"), /dotnet test/);
});

test("python warms uv, node warms npm, dotnet warms nuget", () => {
  assert.deepEqual(toolchains.python.preflight, ["uv sync"]);
  assert.deepEqual(toolchains.node.preflight, ["npm ci"]);
  assert.deepEqual(toolchains.dotnet.preflight, ["dotnet restore"]);
});

test("extraConventions is appended under the standard, never in place of it", () => {
  const rendered = renderConventions("python", "- Frontend: `node --test web/js/**/*.test.mjs`");
  assert.ok(rendered.startsWith(toolchains.python.conventions));
  assert.match(rendered, /Frontend/);
  // Whitespace-only extras must not leave a dangling blank line on the prompt.
  assert.equal(renderConventions("python", "   \n "), toolchains.python.conventions);
  assert.equal(renderConventions("python"), toolchains.python.conventions);
});
