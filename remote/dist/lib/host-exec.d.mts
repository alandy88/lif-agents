export type CaptureResult = {
    stdout: string;
    stderr: string;
    exitCode: number;
};
/**
 * Spawn a host command and resolve { stdout, stderr, exitCode } — NEVER rejects.
 * Child stderr is BOTH written through to process.stderr (so the live output is
 * preserved) and buffered, for callers that want it in a failure detail.
 * A spawn error resolves exitCode 1; when opts.timeoutMs is set and elapses, the
 * child is SIGKILLed and the call resolves exitCode 124.
 */
export declare function capture(command: string, args: string[], opts?: {
    timeoutMs?: number;
}): Promise<CaptureResult>;
/**
 * Spawn a host command and resolve stdout on exit 0; REJECT otherwise with
 * `Error("<command> <args> exited <code>: <stderr>")`. stderr is buffered here
 * (not written through) so the failure message carries it.
 */
export declare function json(command: string, args: string[]): Promise<string>;
/** Git over the host `git` — never rejects; branch on exitCode. */
export declare const hostGit: (args: string[]) => Promise<CaptureResult>;
/** `gh` that never rejects — returns the exit code so callers can distinguish
 *  "no PR" (exit 1) from a real read. */
export declare const ghCapture: (args: string[]) => Promise<CaptureResult>;
/** `gh` read that throws on a non-zero exit (for the `--json` reads). */
export declare const ghJson: (args: string[]) => Promise<string>;
//# sourceMappingURL=host-exec.d.mts.map