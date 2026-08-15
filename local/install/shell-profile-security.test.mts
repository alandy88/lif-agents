import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LOCAL = join(dirname(fileURLToPath(import.meta.url)), "..");
const zshProfile = join(LOCAL, "zsh/profile.zsh");
const pwsh = readFileSync(join(LOCAL, "pwsh/profile.ps1"), "utf8");
const windowsProbe = readFileSync(join(LOCAL, "install/probe-bws-windows.ps1"), "utf8");

function runProfile(commands: string, shell = "bash"): string {
  const root = mkdtempSync(join(tmpdir(), "lif-profile-"));
  const home = join(root, "home");
  const bin = join(root, "bin");
  mkdirSync(join(home, ".bws"), { recursive: true });
  mkdirSync(bin);
  writeFileSync(join(home, ".bws/token"), "TEST_TOKEN\n", { mode: 0o600 });
  writeFileSync(join(bin, "uname"), "#!/bin/sh\necho Linux\n");
  writeFileSync(join(bin, "bws"), `#!/bin/sh
printf 'bws-token=%s args=%s\\n' "\${BWS_ACCESS_TOKEN:-}" "$*"
if [ "$1" = run ]; then
  shift
  while [ "$1" != -- ]; do shift; done
  shift
  BROAD_TEST_SECRET=injected BWS_ACCESS_TOKEN="$BWS_ACCESS_TOKEN" sh -c "$1"
fi
`);
  writeFileSync(join(bin, "claude"), `#!/bin/sh
printf 'claude-token=%s broad=%s args=%s\\n' "\${BWS_ACCESS_TOKEN:-}" "\${BROAD_TEST_SECRET:-}" "$*"
`);
  chmodSync(join(bin, "uname"), 0o755);
  chmodSync(join(bin, "bws"), 0o755);
  chmodSync(join(bin, "claude"), 0o755);
  try {
    return execFileSync(shell, ["-c", `. ${JSON.stringify(zshProfile)}\n${commands}`], {
      encoding: "utf8",
      env: { HOME: home, PATH: `${bin}:/usr/bin:/bin`, BWS_ACCESS_TOKEN: "INHERITED" },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("zsh scopes the token to ordinary bws calls and strips it from bws run children", () => {
  const output = runProfile(`printf 'parent=%s\\n' "\${BWS_ACCESS_TOKEN:-}"\nbws get item\nbws list\nbws run -- 'printf "run-token=%s\\n" "\${BWS_ACCESS_TOKEN:-}"'`);
  assert.match(output, /parent=\n/);
  assert.match(output, /bws-token=TEST_TOKEN args=get item/);
  assert.match(output, /bws-token=TEST_TOKEN args=list/);
  assert.match(output, /run-token=\n/);
});

test("native zsh also strips the token from bws run children", () => {
  const output = runProfile(`bws run -- 'printf "run-token=%s\\n" "\${BWS_ACCESS_TOKEN:-}"'`, "zsh");
  assert.match(output, /run-token=\n/);
});

test("zsh Claude defaults restricted, supports explicit bypass, and injects broadly only explicitly", () => {
  const output = runProfile(`LIF_STUDIO_BWS_PROJECT=project\ncc\nLIF_CLAUDE_PERMISSION_MODE=bypassPermissions cc\nclaude\nclaude-bws --version`);
  assert.match(output, /args=--permission-mode default/);
  assert.match(output, /args=--permission-mode bypassPermissions/);
  assert.match(output, /claude-token= broad= args=/);
  assert.match(output, /claude-token= broad=injected args=--version/);
});

test("Windows probe executes baseline and actual startup paths without bypassing profiles", () => {
  assert.match(windowsProbe, /bws run --shell \$baselineShell/);
  assert.match(windowsProbe, /bws run --no-inherit-env --shell \$actualShell/);
  assert.doesNotMatch(windowsProbe, /ProcessStartInfo\(Pwsh, "[^"]*-NoProfile/);
  assert.match(windowsProbe, /actual_token_absent_before_profile/);
  assert.match(windowsProbe, /actual_parent_survived_before_profile/);
  assert.match(windowsProbe, /actual_path_available_before_profile/);
  assert.match(windowsProbe, /actual_systemroot_available_before_profile/);
  assert.match(windowsProbe, /actual_noop_claude_launched/);
});

test("PowerShell broad injection clears inheritance before the child profile starts", () => {
  const broadLauncher = pwsh.slice(pwsh.indexOf("function claude-bws"));
  assert.match(
    broadLauncher,
    /bws run --no-inherit-env --shell pwsh/,
    "clearing BWS_ACCESS_TOKEN in the command body is too late: pwsh loads its profile first",
  );
  assert.ok(
    broadLauncher.indexOf("--no-inherit-env") < broadLauncher.indexOf("--shell pwsh"),
    "BWS must clear the environment before spawning the selected shell",
  );
});

test("PowerShell profile has parity for token scope and explicit security choices", () => {
  assert.match(pwsh, /Remove-Item Env:BWS_ACCESS_TOKEN/);
  assert.match(pwsh, /function bws/);
  assert.match(pwsh, /\$env:BWS_ACCESS_TOKEN = \$null;/);
  assert.match(pwsh, /else \{ 'default' \}/);
  assert.match(pwsh, /bypassPermissions/);
  assert.match(pwsh, /function claude-bws/);
  assert.doesNotMatch(pwsh.match(/function claude \{[\s\S]*?\n\}/)?.[0] ?? "", /bws run/);
});
