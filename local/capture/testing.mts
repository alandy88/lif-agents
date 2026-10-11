// Shared by local/install/capture-*.test.mts: a temp environment with a fake
// `herdr` on PATH, and the native-messaging frame.

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { endianness, tmpdir } from "node:os";
import path from "node:path";

const LE = endianness() === "LE";

export interface TempEnv {
  bin: string;
  tmp: string;
  home: string;
  vault: string;
  env: NodeJS.ProcessEnv;
  /** One entry per `herdr` call: its argv. */
  calls(): string[][];
}

/** The log path is baked into the fake, so it still logs under a stripped env. */
export function tempEnv(opts: { failing?: boolean } = {}): TempEnv {
  const root = mkdtempSync(path.join(tmpdir(), "lif-capture-test-"));
  const [bin, tmp, home, vault] = ["bin", "tmp", "home", "vault"].map((name) => {
    const dir = path.join(root, name);
    mkdirSync(dir);
    return dir;
  }) as [string, string, string, string];
  const log = path.join(root, "herdr.log");
  const reply = opts.failing
    ? `printf '%s\\n' '{"error":{"code":"x","message":"server not running"}}' >&2\nexit 1`
    : `case "$*" in
  *"tab create"*) printf '%s\\n' '{"result":{"tab":{"tab_id":"w1:t9"},"root_pane":{"pane_id":"w1:p9"}}}' ;;
  *) printf '%s\\n' '{"result":{}}' ;;
esac`;
  const fake = path.join(bin, "herdr");
  writeFileSync(fake, `#!/bin/sh\nprintf '%s\\037' "$@" >> '${log}'\nprintf '\\n' >> '${log}'\n${reply}\n`);
  chmodSync(fake, 0o755);
  return {
    bin,
    tmp,
    home,
    vault,
    env: { PATH: bin, TMPDIR: tmp, HOME: home, LIF_NOTES_VAULT: vault },
    calls: () =>
      existsSync(log)
        ? readFileSync(log, "utf8")
            .split("\n")
            .filter(Boolean)
            .map((line) => line.split("\x1f").slice(0, -1))
        : [],
  };
}

export function frame(message: unknown): Buffer {
  const body = Buffer.from(typeof message === "string" ? message : JSON.stringify(message));
  const head = Buffer.alloc(4);
  if (LE) head.writeUInt32LE(body.length);
  else head.writeUInt32BE(body.length);
  return Buffer.concat([head, body]);
}

/** Throws unless `bytes` is exactly one frame: the prefix equals the remaining byte count. */
export function unframe(bytes: Buffer): Record<string, unknown> {
  if (bytes.length < 4) throw new Error(`expected a framed reply, got ${bytes.length} bytes`);
  const length = LE ? bytes.readUInt32LE(0) : bytes.readUInt32BE(0);
  if (length !== bytes.length - 4) {
    throw new Error(`frame length ${length} does not match the ${bytes.length - 4} bytes after it`);
  }
  return JSON.parse(bytes.subarray(4).toString("utf8")) as Record<string, unknown>;
}
