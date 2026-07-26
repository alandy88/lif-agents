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