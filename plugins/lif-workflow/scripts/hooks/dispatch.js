#!/usr/bin/env node
// Hook dispatcher — selects .ps1 (Windows) or .sh (Unix) based on platform
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const hookName = process.argv[2];
if (!hookName) {
	process.stderr.write("dispatch.js: missing hook name argument\n");
	process.exit(2);
}

const dir = import.meta.dirname;
const isWin = process.platform === "win32";

const ext = isWin ? ".ps1" : ".sh";
const script = path.join(dir, hookName + ext);

if (!fs.existsSync(script)) {
	process.stderr.write(`dispatch.js: script not found: ${script}\n`);
	process.exit(2);
}

const cmd = isWin ? "pwsh" : "bash";
const args = isWin ? ["-NoProfile", "-File", script] : [script];

const result = spawnSync(cmd, args, { stdio: "inherit" });
process.exit(result.status ?? 1);
