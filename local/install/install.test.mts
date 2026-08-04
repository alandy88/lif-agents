// The unix installer, driven for real against a throwaway checkout and a
// throwaway $HOME. install.sh takes no arguments that stub anything out, so
// the only honest way to test it is to build the tree it expects and run it.
//
// It lives here rather than under remote/tests/ because it covers the local
// half; the root `npm test` glob picks it up.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const INSTALL_DIR = dirname(fileURLToPath(import.meta.url));
const ENV_NAME = "testenv";

/**
 * A checkout at the current layout plus a $HOME to install into.
 *
 * The installer is copied rather than run in place: it derives everything from
 * its own location, so a copy under `<root>/repo/local/install/` is what makes
 * it treat the temp tree as the checkout.
 */
function scaffold(name: string): { root: string; repo: string; home: string } {
  const root = mkdtempSync(join(tmpdir(), `install-${name}-`));
  const repo = join(root, "repo");
  const home = join(root, "home");

  for (const dir of ["wezterm", "starship", "zsh", "herdr", `environments/${ENV_NAME}`, "install"]) {
    mkdirSync(join(repo, "local", dir), { recursive: true });
  }
  mkdirSync(join(home, ".config"), { recursive: true });

  writeFileSync(join(repo, "local/wezterm/wezterm.lua"), "-- wezterm\n");
  writeFileSync(join(repo, "local/starship/starship.toml"), "# starship\n");
  writeFileSync(join(repo, "local/zsh/profile.zsh"), "# zsh\n");
  writeFileSync(join(repo, "local/herdr/config.toml"), "default_shell = '@LIF_HERDR_DEFAULT_SHELL@'\n");
  writeFileSync(join(repo, `local/environments/${ENV_NAME}/host.lua`), "-- current overlay\n");
  writeFileSync(join(repo, `local/environments/${ENV_NAME}/host.sh`), "# current overlay\n");
  cpSync(join(INSTALL_DIR, "install.sh"), join(repo, "local/install/install.sh"));

  return { root, repo, home };
}

function install(repo: string, home: string): string {
  return execFileSync(
    "bash",
    [join(repo, "local/install/install.sh"), "--env", ENV_NAME, "--skip-shell-rc"],
    { env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config") }, encoding: "utf8" },
  );
}

/** An overlay link as a pre-move install left it: at the old repo-root path. */
function linkPreMove(repo: string, home: string, file: string, link: string): void {
  symlinkSync(join(repo, "environments", ENV_NAME, file), join(home, ".config", link));
}

test("relinks a pre-move overlay link whose old target still exists", () => {
  // The old root-level directory is still on disk, so the link resolves — it is
  // just pointing at the wrong copy. Left alone, every later overlay edit here
  // would be silently ignored.
  const { root, repo, home } = scaffold("premove-live");
  mkdirSync(join(repo, "environments", ENV_NAME), { recursive: true });
  writeFileSync(join(repo, "environments", ENV_NAME, "host.lua"), "-- stale overlay\n");
  linkPreMove(repo, home, "host.lua", "lif-host.lua");

  install(repo, home);

  assert.equal(
    readlinkSync(join(home, ".config/lif-host.lua")),
    join(repo, `local/environments/${ENV_NAME}/host.lua`),
  );
  rmSync(root, { recursive: true, force: true });
});

test("repairs a pre-move overlay link left dangling by the move", () => {
  // Nothing at the old path any more, so the link cannot be resolved at all.
  // This is the state the move actually leaves behind, and the reason the check
  // matches the link text and not only the resolved target.
  const { root, repo, home } = scaffold("premove-dangling");
  linkPreMove(repo, home, "host.lua", "lif-host.lua");
  linkPreMove(repo, home, "host.sh", "lif-host.sh");

  install(repo, home);

  assert.equal(
    readlinkSync(join(home, ".config/lif-host.lua")),
    join(repo, `local/environments/${ENV_NAME}/host.lua`),
  );
  assert.equal(
    readlinkSync(join(home, ".config/lif-host.sh")),
    join(repo, `local/environments/${ENV_NAME}/host.sh`),
  );
  rmSync(root, { recursive: true, force: true });
});

test("still keeps a symlink that points outside the checkout", () => {
  // The counterweight to the two above: widening the match must not make the
  // installer adopt overlay links the captain pointed somewhere of their own.
  const { root, repo, home } = scaffold("foreign");
  const foreign = join(root, "elsewhere/host.lua");
  mkdirSync(dirname(foreign), { recursive: true });
  writeFileSync(foreign, "-- not ours\n");
  symlinkSync(foreign, join(home, ".config/lif-host.lua"));

  const output = install(repo, home);

  assert.equal(readlinkSync(join(home, ".config/lif-host.lua")), foreign);
  assert.match(output, /keep .*lif-host\.lua \(symlink outside repo environments\/\)/);
  rmSync(root, { recursive: true, force: true });
});
