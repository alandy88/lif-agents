/**
 * Reject any `--flag` outside the known set. Without this, a stale invocation
 * (e.g. Morrow's retired `--agent claude`) silently runs on defaults — which
 * for the unattended presets means merging work built by the wrong models.
 */
export declare function assertKnownFlags(argv: string[], known: readonly string[]): void;
/** Read `--name value` out of an argv slice. Shared by the preset entrypoints. */
export declare function readFlag(argv: string[], name: string): string | undefined;
//# sourceMappingURL=cli.d.mts.map