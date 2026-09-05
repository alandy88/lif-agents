// The unix installer, driven for real against a throwaway checkout and a
// throwaway $HOME. install.sh takes no arguments that stub anything out, so
// the only honest way to test it is to build the tree it expects and run it.
//
// It lives here rather than under remote/tests/ because it covers the local
// half; the root `bun run test` glob picks it up.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
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

  for (const dir of [
    "wezterm",
    "starship",
    "zsh",
    "herdr",
    "pi/extensions",
    "bin",
    `environments/${ENV_NAME}`,
    "install",
  ]) {
    mkdirSync(join(repo, "local", dir), { recursive: true });
  }
  mkdirSync(join(home, ".config"), { recursive: true });

  writeFileSync(join(repo, "local/wezterm/wezterm.lua"), "-- wezterm\n");
  writeFileSync(join(repo, "local/starship/starship.toml"), "# starship\n");
  writeFileSync(join(repo, "local/zsh/profile.zsh"), "# zsh\n");
  writeFileSync(join(repo, "local/bin/lif-bws"), "#!/bin/sh\n");
  writeFileSync(join(repo, "local/herdr/config.toml"), "default_shell = '@LIF_HERDR_DEFAULT_SHELL@'\n");
  writeFileSync(join(repo, `local/environments/${ENV_NAME}/host.lua`), "-- current overlay\n");
  writeFileSync(join(repo, `local/environments/${ENV_NAME}/host.sh`), "# current overlay\n");
  cpSync(join(INSTALL_DIR, "install.sh"), join(repo, "local/install/install.sh"));
  cpSync(
    join(INSTALL_DIR, "../pi/extensions/pi-status-footer.ts"),
    join(repo, "local/pi/extensions/pi-status-footer.ts"),
  );

  cpSync(
    join(INSTALL_DIR, "../pi/extensions/quiet-tools.ts"),
    join(repo, "local/pi/extensions/quiet-tools.ts"),
  );
  return { root, repo, home };
}

function install(repo: string, home: string, ...options: string[]): string {
  return execFileSync(
    "bash",
    [join(repo, "local/install/install.sh"), "--env", ENV_NAME, ...options, "--skip-shell-rc"],
    { env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config") }, encoding: "utf8" },
  );
}

const sourceLine = '[ -r "$HOME/.config/lif-shell.zsh" ] && . "$HOME/.config/lif-shell.zsh"';
const managedBlock = `# >>> lif-terminal >>>\n${sourceLine}\n# <<< lif-terminal <<<\n`;

function installShell(repo: string, home: string, options: string[] = [], zdotdir = ""): string {
  return execFileSync("bash", [join(repo, "local/install/install.sh"), "--env", ENV_NAME, ...options], {
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), ZDOTDIR: zdotdir },
    encoding: "utf8",
  });
}

for (const preview of [false, true]) {
  test(`shell wiring respects ZDOTDIR (preview=${preview})`, () => {
    const { root, repo, home } = scaffold("zdotdir");
    try {
      const zdotdir = join(home, "custom zsh");
      const rc = join(zdotdir, ".zshrc");
      const output = installShell(repo, home, preview ? ["--dry-run"] : [], zdotdir);
      assert.ok(output.includes(rc));
      assert.equal(existsSync(join(home, ".zshrc")), false);
      if (preview) assert.equal(existsSync(rc), false);
      else {
        assert.equal(readFileSync(rc, "utf8"), `\n${managedBlock}`);
        assert.match(installShell(repo, home, [], zdotdir), /ok .*\.zshrc/);
        assert.equal(readFileSync(rc, "utf8"), `\n${managedBlock}`);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

for (const [name, content, warning] of [
  ["missing source", "# >>> lif-terminal >>>\n# <<< lif-terminal <<<\n", /incomplete or modified lif-terminal block/],
  ["missing end", `# >>> lif-terminal >>>\n${sourceLine}\n`, /incomplete or modified lif-terminal block/],
  ["orphan end", "# <<< lif-terminal <<<\n", /incomplete or modified lif-terminal block/],
  ["duplicate block", managedBlock + managedBlock, /incomplete or modified lif-terminal block/],
  ["theme", 'ZSH_THEME="robbyrussell"\nsource "$ZSH/oh-my-zsh.sh"\n' + managedBlock, /Oh My Zsh theme.*ZSH_THEME/],
  ["order", managedBlock + 'source "$ZSH/oh-my-zsh.sh"\n', /lif-terminal block precedes Oh My Zsh/],
  ["duplicate prompt", 'eval "$(starship init zsh)"\n' + managedBlock, /Starship.*initialized.*profile/],
] as const) {
  test(`shell wiring warns without rewriting: ${name}`, () => {
    const { root, repo, home } = scaffold("rc-warning");
    try {
      const rc = join(home, ".zshrc");
      writeFileSync(rc, content);
      for (const options of [["--dry-run"], []]) {
        assert.match(installShell(repo, home, options), warning);
        assert.equal(readFileSync(rc, "utf8"), content);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test("shell wiring preserves existing config and ignores commented prompt settings", () => {
  const { root, repo, home } = scaffold("rc-safe");
  try {
    const rc = join(home, ".zshrc");
    const content = '# ZSH_THEME="robbyrussell"\n# eval "$(starship init zsh)"\nZSH_THEME=""\nsource "$ZSH/oh-my-zsh.sh"\n';
    writeFileSync(rc, content);
    assert.doesNotMatch(installShell(repo, home), /warn/);
    assert.equal(readFileSync(rc, "utf8"), content + "\n" + managedBlock);
    assert.equal(readFileSync(`${rc}.pre-lif-terminal.bak`, "utf8"), content);
    assert.doesNotMatch(installShell(repo, home), /warn/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function footerPath(home: string): string {
  return join(home, ".pi/agent/extensions/pi-status-footer.ts");
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

test("installs the Pi footer as a checkout link and is idempotent", () => {
  const { root, repo, home } = scaffold("pi-footer-idempotent");
  const destination = footerPath(home);
  const source = join(repo, "local/pi/extensions/pi-status-footer.ts");

  install(repo, home);
  assert.equal(readlinkSync(destination), source);

  const secondOutput = install(repo, home);
  assert.match(secondOutput, /ok .*pi-status-footer\.ts/);
  assert.equal(existsSync(`${destination}.pre-lif-terminal.bak`), false);
  rmSync(root, { recursive: true, force: true });
});

test("backs up an existing Pi footer before replacing it", () => {
  const { root, repo, home } = scaffold("pi-footer-backup");
  const destination = footerPath(home);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, "captain's previous footer\n");

  install(repo, home);

  assert.equal(readlinkSync(destination), join(repo, "local/pi/extensions/pi-status-footer.ts"));
  assert.equal(readFileSync(`${destination}.pre-lif-terminal.bak`, "utf8"), "captain's previous footer\n");
  rmSync(root, { recursive: true, force: true });
});

test("keeps an unrelated Pi extension symlink", () => {
  const { root, repo, home } = scaffold("pi-footer-foreign");
  const destination = footerPath(home);
  const foreign = join(root, "captain/pi-status-footer.ts");
  mkdirSync(dirname(foreign), { recursive: true });
  writeFileSync(foreign, "captain-owned\n");
  mkdirSync(dirname(destination), { recursive: true });
  symlinkSync(foreign, destination);

  const output = install(repo, home);

  assert.equal(readlinkSync(destination), foreign);
  assert.match(output, /keep .*pi-status-footer\.ts \(symlink outside this checkout\)/);
  rmSync(root, { recursive: true, force: true });
});

test("previews Pi footer installation without touching the destination", () => {
  const { root, repo, home } = scaffold("pi-footer-preview");
  const output = install(repo, home, "--dry-run");

  assert.match(output, /would link .*pi-status-footer\.ts/);
  assert.equal(existsSync(footerPath(home)), false);
  rmSync(root, { recursive: true, force: true });
});

for (const scenario of ["fresh", "file", "foreign", "preview", "preview-file"] as const) {
  test(`quiet-tools installer: ${scenario}`, () => {
    const { root, repo, home } = scaffold(`quiet-${scenario}`);
    const destination = join(home, ".pi/agent/extensions/quiet-tools.ts");
    const source = join(repo, "local/pi/extensions/quiet-tools.ts");
    const foreign = join(root, "foreign.ts");
    try {
      mkdirSync(dirname(destination), { recursive: true });
      if (scenario === "file" || scenario === "preview-file") writeFileSync(destination, "previous");
      if (scenario === "foreign") {
        writeFileSync(foreign, "foreign");
        symlinkSync(foreign, destination);
      }
      install(repo, home, ...(scenario.startsWith("preview") ? ["--dry-run"] : []));
      if (scenario === "preview") assert.equal(existsSync(destination), false);
      else if (scenario === "preview-file") {
        assert.equal(readFileSync(destination, "utf8"), "previous");
        assert.equal(existsSync(`${destination}.pre-lif-terminal.bak`), false);
      } else if (scenario === "foreign") assert.equal(readlinkSync(destination), foreign);
      else {
        assert.equal(readlinkSync(destination), source);
        if (scenario === "file") assert.equal(readFileSync(`${destination}.pre-lif-terminal.bak`, "utf8"), "previous");
        assert.match(install(repo, home), /ok .*quiet-tools\.ts/);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("preview reports the footer backup without creating it", () => {
  const { root, repo, home } = scaffold("pi-footer-preview-existing");
  const destination = footerPath(home);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, "captain's previous footer\n");

  const output = install(repo, home, "--dry-run");

  assert.match(output, /would bak .*pi-status-footer\.ts\.pre-lif-terminal\.bak/);
  assert.equal(readFileSync(destination, "utf8"), "captain's previous footer\n");
  assert.equal(existsSync(`${destination}.pre-lif-terminal.bak`), false);
  rmSync(root, { recursive: true, force: true });
});
