export type NextTask = {
    /** The human label, e.g. "1.4 Nature kit data". */
    label: string;
    /** Branch derived from the label, e.g. "agent/1-4-nature-kit-data". */
    branch: string;
};
/** Lowercase, alphanumeric-and-hyphens, bounded — safe as a git branch segment. */
export declare function taskSlug(label: string): string;
export declare function taskBranch(label: string): string;
/**
 * Extract the newest "Next task" recommendation from STATE.md. Entries are
 * newest-first, so the first match wins. Returns undefined when no entry
 * carries one (a malformed ledger — the loop must stop, not guess).
 */
export declare function parseNextTask(stateMd: string): NextTask | undefined;
//# sourceMappingURL=state.d.mts.map