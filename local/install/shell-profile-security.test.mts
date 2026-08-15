import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LOCAL = join(dirname(fileURLToPath(import.meta.url)), "..");
const zshProfile = join(LOCAL, "zsh/profile.zsh");
const lifBws = join(LOCAL, "bin/lif-bws");
const pwsh = readFileSync(join(LOCAL, "pwsh/profile.ps1"), "utf8");
const lifBwsPs1 = readFileSync(join(LOCAL, "bin/lif-bws.ps1"), "utf8");
const lifBwsCmd = readFileSync(join(LOCAL, "bin/lif-bws.cmd"), "utf8");
const windowsInstaller = readFileSync(join(LOCAL, "install/install.ps1"), "utf8");

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
  BROAD_TEST_SECRET=injected env -u BWS_ACCESS_TOKEN sh -c "$1"
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

test("profile-independent Unix wrapper supports noninteractive BWS calls", () => {
  const root = mkdtempSync(join(tmpdir(), "lif-bws-wrapper-"));
  const home = join(root, "home");
  const bin = join(root, "bin");
  mkdirSync(join(home, ".bws"), { recursive: true });
  mkdirSync(bin);
  writeFileSync(join(home, ".bws/token"), "TEST_TOKEN\n", { mode: 0o600 });
  writeFileSync(join(bin, "uname"), "#!/bin/sh\necho Linux\n");
  writeFileSync(join(bin, "bws"), "#!/bin/sh\nprintf 'token=%s args=%s\\n' \"$BWS_ACCESS_TOKEN\" \"$*\"\n");
  chmodSync(join(bin, "uname"), 0o755);
  chmodSync(join(bin, "bws"), 0o755);
  try {
    const output = execFileSync(lifBws, ["list"], { encoding: "utf8", env: { HOME: home, PATH: `${bin}:/usr/bin:/bin` } });
    assert.equal(output, "token=TEST_TOKEN args=list\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("zsh scopes the token to ordinary bws calls and strips it from bws run children", () => {
  const output = runProfile(`printf 'parent=%s\\n' "\${BWS_ACCESS_TOKEN:-}"\nbws get item\nbws list\nbws run -- 'printf "run-token=%s\\n" "\${BWS_ACCESS_TOKEN:-}"'`);
  assert.match(output, /parent=\n/);
  assert.match(output, /bws-token=TEST_TOKEN args=get item/);
  assert.match(output, /bws-token=TEST_TOKEN args=list/);
  assert.match(output, /args=run -- printf "run-token=%s\\n"/);
  assert.doesNotMatch(output, /unset BWS_ACCESS_TOKEN/);
  assert.match(output, /run-token=\n/);
});

test("native zsh also strips the token from bws run children", () => {
  const output = runProfile(`bws run -- 'printf "run-token=%s\\n" "\${BWS_ACCESS_TOKEN:-}"'`, "zsh");
  assert.match(output, /run-token=\n/);
});

test("zsh preserves permission behavior and injects broadly only explicitly", () => {
  const output = runProfile(`LIF_STUDIO_BWS_PROJECT=project\ncc\nLIF_CLAUDE_PERMISSION_MODE=plan cc\nclaude\nclaude-bws --version`);
  assert.match(output, /args=--dangerously-skip-permissions/);
  assert.match(output, /args=--permission-mode plan/);
  assert.match(output, /claude-token= broad= args=/);
  assert.match(output, /claude-token= broad=injected args=--version/);
});

test("Windows installs a profile-independent native lif-bws entrypoint", () => {
  assert.match(lifBwsCmd, /pwsh -NoProfile -File "%~dp0lif-bws\.ps1" %\*/);
  assert.match(lifBwsCmd, /exit \/b %ERRORLEVEL%/);
  assert.match(windowsInstaller, /bin\\lif-bws\.ps1/);
  assert.match(windowsInstaller, /bin\\lif-bws\.cmd/);
  assert.match(lifBwsPs1, /Select-Object -First 1/);
  assert.doesNotMatch(lifBwsPs1, /Sort-Object Source/);
});

test("PowerShell profile has parity for token scope and explicit security choices", () => {
  assert.match(pwsh, /Remove-Item Env:BWS_ACCESS_TOKEN/);
  assert.match(pwsh, /function bws/);
  assert.doesNotMatch(pwsh, /\$argv\[\$separator \+ 1\]/);
  assert.match(pwsh, /BWS_ACCESS_TOKEN = \$null; \$env:CLAUDE_CODE_OAUTH_TOKEN = \$null;/);
  assert.match(pwsh, /Select-Object -First 1/);
  assert.doesNotMatch(pwsh, /Sort-Object Source/);
  assert.match(pwsh, /--dangerously-skip-permissions/);
  assert.doesNotMatch(pwsh, /\$argv\[\$separator \+ 1\]/);
  assert.match(pwsh, /function claude-bws/);
  assert.doesNotMatch(pwsh.match(/function claude \{[\s\S]*?\n\}/)?.[0] ?? "", /bws run/);
});
