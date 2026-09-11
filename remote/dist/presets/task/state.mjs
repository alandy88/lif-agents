// STATE.md parsing — the ledger lifecycle's progress file. Internal to this
// preset on purpose: the ledger FORMAT is the preset's contract, not the kit's.
// A consumer that adopts `presets/task` adopts the format; nothing in `lib/`
// should grow an opinion about it.
//
// STATE.md is newest-entry-first; every task session ends its entry with a
// "Next task: **<label>**" recommendation line, and that line drives the loop.
/** Lowercase, alphanumeric-and-hyphens, bounded — safe as a git branch segment. */
export function taskSlug(label) {
    return (label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48)
        .replace(/-+$/, "") || "task");
}
export function taskBranch(label) {
    return `agent/${taskSlug(label)}`;
}
/**
 * Extract the newest "Next task" recommendation from STATE.md. Entries are
 * newest-first, so the first match wins. Returns undefined when no entry
 * carries one (a malformed ledger — the loop must stop, not guess).
 */
export function parseNextTask(stateMd) {
    const match = stateMd.match(/Next task(?: recommendation)?:?\s*\*\*([^*]+)\*\*/);
    if (!match)
        return undefined;
    const label = match[1].trim();
    if (!label)
        return undefined;
    return { label, branch: taskBranch(label) };
}
//# sourceMappingURL=state.mjs.map