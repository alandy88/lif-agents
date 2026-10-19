// The ONE host-process spawn seam. Two shapes:
//
//   • capture — never rejects; resolves { stdout, stderr, exitCode } so a caller
//     can branch on the code (e.g. "no PR" exit 1 vs a real read). Child stderr
//     is BOTH written through to process.stderr and buffered, for callers that
//     want it in a failure detail. A spawn error resolves exitCode 1; a timeout
//     kills the child and resolves exitCode 124.
//   • json    — resolves stdout on exit 0, REJECTS otherwise with the stderr in
//     the message, for callers that want a throw on failure (the `gh ... --json`
//     reads, where a non-zero exit is genuinely exceptional).
import { spawn } from "node:child_process";
/**
 * Spawn a host command and resolve { stdout, stderr, exitCode } — NEVER rejects.
 * Child stderr is BOTH written through to process.stderr (so the live output is
 * preserved) and buffered, for callers that want it in a failure detail.
 * A spawn error resolves exitCode 1; when opts.timeoutMs is set and elapses, the
 * child is SIGKILLed and the call resolves exitCode 124.
 */
export function capture(command, args, opts = {}) {
    return new Promise((resolve) => {
        const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        const timer = opts.timeoutMs != null
            ? setTimeout(() => {
                proc.kill("SIGKILL");
                resolve({ stdout, stderr, exitCode: 124 });
            }, opts.timeoutMs)
            : undefined;
        proc.stdout.on("data", (chunk) => (stdout += chunk.toString("utf8")));
        proc.stderr.on("data", (chunk) => {
            stderr += chunk.toString("utf8");
            process.stderr.write(chunk);
        });
        proc.on("error", (error) => {
            if (timer)
                clearTimeout(timer);
            process.stderr.write(`[host-exec] ${command} spawn error: ${error.message}\n`);
            resolve({ stdout: "", stderr: error.message, exitCode: 1 });
        });
        proc.on("close", (code) => {
            if (timer)
                clearTimeout(timer);
            resolve({ stdout, stderr, exitCode: code ?? 1 });
        });
    });
}
/**
 * Spawn a host command and resolve stdout on exit 0; REJECT otherwise with
 * `Error("<command> <args> exited <code>: <stderr>")`. stderr is buffered here
 * (not written through) so the failure message carries it.
 */
export function json(command, args) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (chunk) => (stdout += chunk.toString("utf8")));
        proc.stderr.on("data", (chunk) => (stderr += chunk.toString("utf8")));
        proc.on("error", reject);
        proc.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(`${command} ${args.join(" ")} exited ${code}: ${stderr}`));
                return;
            }
            resolve(stdout);
        });
    });
}
/** Git over the host `git` — never rejects; branch on exitCode. */
export const hostGit = (args) => capture("git", args);
/** `gh` that never rejects — returns the exit code so callers can distinguish
 *  "no PR" (exit 1) from a real read. */
export const ghCapture = (args) => capture("gh", args);
/** `gh` read that throws on a non-zero exit (for the `--json` reads). */
export const ghJson = (args) => json("gh", args);
//# sourceMappingURL=host-exec.mjs.map