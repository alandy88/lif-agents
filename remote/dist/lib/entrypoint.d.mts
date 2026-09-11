/**
 * True when `importMetaUrl`'s module is the process entrypoint — i.e. it was
 * invoked directly (`npx tsx .sandcastle/config.mts`) rather than imported by a
 * sibling module or a unit test.
 *
 * Lets a consumer's `config.mts` be both the config module and the CLI entry,
 * which is what keeps the consumer contract at one file.
 */
export declare function isEntrypoint(importMetaUrl: string): boolean;
//# sourceMappingURL=entrypoint.d.mts.map