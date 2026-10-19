/**
 * Reject any `--flag` outside the known set. Without this, a stale invocation
 * (e.g. Morrow's retired `--agent claude`) silently runs on defaults — which
 * for the unattended presets means merging work built by the wrong models.
 */
export function assertKnownFlags(argv, known) {
    for (const token of argv) {
        if (token.startsWith("--") && !known.includes(token)) {
            throw new Error(`unknown flag ${token} — known flags: ${known.join(", ")}`);
        }
    }
}
/** Read `--name value` out of an argv slice. Shared by the preset entrypoints. */
export function readFlag(argv, name) {
    const index = argv.indexOf(name);
    if (index === -1)
        return undefined;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
        throw new Error(`${name} requires a value`);
    }
    return value;
}
//# sourceMappingURL=cli.mjs.map