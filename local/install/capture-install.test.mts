import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { frame, tempEnv, unframe } from "../capture/testing.mts";
import type { TempEnv } from "../capture/testing.mts";

const installer = path.resolve("local/capture/install.sh");
const host = path.resolve("local/capture/host.mts");
const chromeId = "abcdefghijklmnopabcdefghijklmnop";

/** The installer needs `bun` and the coreutils; the fake `herdr` stays first. */
function install(t: TempEnv, args: string[], env: NodeJS.ProcessEnv = {}) {
  const PATH = `${t.bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
  return spawnSync(installer, args, { encoding: "utf8", env: { ...t.env, PATH, ...env } });
}

function hostManifest(t: TempEnv, relative: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(t.home, relative), "utf8")) as Record<string, unknown>;
}

test("install renders the launcher and both host manifests under --home", () => {
  const t = tempEnv();
  const result = install(t, ["--home", t.home, "--chrome-id", chromeId]);
  assert.equal(result.status, 0, result.stderr);

  const firefox = hostManifest(t, ".mozilla/native-messaging-hosts/lif_capture.json");
  const chrome = hostManifest(t, ".config/google-chrome/NativeMessagingHosts/lif_capture.json");
  const launcher = path.join(t.home, ".local/share/lif-capture/lif-capture-host");
  for (const manifest of [firefox, chrome]) {
    assert.equal(manifest["name"], "lif_capture");
    assert.equal(manifest["type"], "stdio");
    assert.equal(manifest["path"], launcher);
  }
  accessSync(launcher, constants.X_OK);

  const extension = JSON.parse(
    readFileSync("local/capture/extension/manifest.json", "utf8"),
  ) as { browser_specific_settings: { gecko: { id: string } } };
  assert.deepEqual(firefox["allowed_extensions"], [extension.browser_specific_settings.gecko.id]);
  assert.deepEqual(chrome["allowed_origins"], [`chrome-extension://${chromeId}/`]);

  const text = readFileSync(launcher, "utf8");
  assert.ok(text.includes(t.vault));
  assert.ok(text.includes(t.bin));
  assert.ok(text.includes(host));
});

test("the rendered launcher runs a capture from a bare environment", () => {
  const t = tempEnv();
  assert.equal(install(t, ["--home", t.home, "--chrome-id", chromeId]).status, 0);
  const launcher = path.join(t.home, ".local/share/lif-capture/lif-capture-host");
  const sample = readFileSync("local/capture/samples/capture.json", "utf8");

  // What a browser gives the host: no vault variable, and no herdr on PATH.
  const result = spawnSync(launcher, [], {
    input: frame(sample),
    env: { TMPDIR: t.tmp, HOME: t.home, PATH: "/usr/bin:/bin" },
  });

  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(unframe(result.stdout)["ok"], true);
  assert.equal(t.calls()[0]?.[5], t.vault);
});

test("install refuses bad input and writes nothing", () => {
  const t = tempEnv();
  const cases: [string, string[], NodeJS.ProcessEnv][] = [
    ["no --home", ["--chrome-id", chromeId], {}],
    ["no --chrome-id", ["--home", t.home], {}],
    ["a short --chrome-id", ["--home", t.home, "--chrome-id", "abc"], {}],
    ["LIF_NOTES_VAULT unset", ["--home", t.home, "--chrome-id", chromeId], { LIF_NOTES_VAULT: undefined }],
  ];

  for (const [name, args, env] of cases) {
    const result = install(t, args, env);
    assert.notEqual(result.status, 0, name);
    assert.match(result.stderr, /usage:/, name);
    assert.deepEqual(readdirSync(t.home), [], name);
  }
});

test("install refuses a folder symlink that leads outside --home", () => {
  const t = tempEnv();
  symlinkSync(t.vault, path.join(t.home, ".config"));

  const result = install(t, ["--home", t.home, "--chrome-id", chromeId]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /outside --home/);
  assert.deepEqual(readdirSync(t.vault), []);
  assert.deepEqual(readdirSync(t.home), [".config"]);
});

test("install refuses a launcher symlink that leads outside --home", () => {
  const t = tempEnv();
  const outside = path.join(t.vault, "keep.md");
  writeFileSync(outside, "keep", { mode: 0o600 });
  mkdirSync(path.join(t.home, ".local/share/lif-capture"), { recursive: true });
  symlinkSync(outside, path.join(t.home, ".local/share/lif-capture/lif-capture-host"));

  const result = install(t, ["--home", t.home, "--chrome-id", chromeId]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /outside --home/);
  assert.equal(readFileSync(outside, "utf8"), "keep");
  assert.equal(statSync(outside).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(t.home), [".local"]);
});
