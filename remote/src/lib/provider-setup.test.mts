import { test } from "node:test";
import assert from "node:assert/strict";
import { providerPreflight } from "./provider-setup.mts";
import { forwardedEnvKeys, phaseProfiles, profiles } from "./profiles.mts";

test("providerPreflight covers only the providers a run uses", () => {
  assert.deepEqual(providerPreflight([profiles.claude]), [
    providerPreflight([profiles.claude])[0],
    "claude --version",
  ]);
  const codexOnly = providerPreflight([profiles.gpt]);
  assert.equal(codexOnly.length, 2);
  assert.match(codexOnly[0]!, /CODEX_AUTH_JSON/);
  assert.equal(codexOnly[1], "codex --version");
  assert.doesNotMatch(codexOnly.join("\n"), /CLAUDE/);
});

test("the mixed phase map authenticates both providers, once each", () => {
  const commands = providerPreflight(Object.values(phaseProfiles));
  assert.equal(commands.length, 4, "two providers × (shim + version)");
  assert.deepEqual(commands.slice(1), [
    "claude --version",
    commands[2]!,
    "codex --version",
  ]);
});

test("every credential providerPreflight consumes is one forwardedEnvKeys sends", () => {
  // The split these two used to have was the bug: the kit forwarded
  // CODEX_AUTH_JSON and left the half that consumes it to each consumer.
  for (const profile of [profiles.claude, profiles.gpt]) {
    const forwarded = forwardedEnvKeys([profile]);
    for (const match of providerPreflight([profile]).join("\n").matchAll(/\$([A-Z_]+)/g)) {
      assert.ok(
        forwarded.includes(match[1]!),
        `${match[1]} is consumed in preflight but never forwarded`,
      );
    }
  }
});

test("the auth shims are no-ops when the credential blob is unset", () => {
  // API-key runs forward an empty value; the guard must skip, not fail.
  for (const command of providerPreflight(Object.values(phaseProfiles))) {
    if (command.endsWith("--version")) continue;
    assert.match(command, /^\[ -z "\$[A-Z_]+" \] \|\| /);
  }
});
