// Pure admission decisions for the issue-driven lifecycle, extracted out of
// `presets/implement.mts`'s `main()`. This module reads and decides; it never
// writes. The single write-then-throw the four guards used to repeat is now
// `main`'s job alone, driven off the `Admission` this returns.
import { resolvePhases } from "./profiles.mjs";
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
/**
 * The four admission guards, in the order `main` used to run them — a closed
 * issue is rejected before a missing label is skipped, and both precede the
 * epic check and profile resolution.
 */
export async function admit(request, reads) {
    const issue = await reads.getIssue(request.issueNumber);
    if (issue.state === "CLOSED") {
        return {
            kind: "rejected",
            because: "closed",
            detail: `Issue #${request.issueNumber} is closed; the sandcastle-agent run requires an open issue.`,
        };
    }
    if (request.trigger === "issues" && !issue.labels.includes("ready-for-agent")) {
        return {
            kind: "skipped",
            reason: `Issue #${request.issueNumber} no longer has the ready-for-agent label (removed while queued) — skipping.`,
        };
    }
    if (await reads.issueIsEpic(request.issueNumber)) {
        return {
            kind: "rejected",
            because: "epic",
            detail: `Issue #${request.issueNumber} has native GitHub sub-issues (it's an epic); the sandcastle-agent run ` +
                `only handles atomic issues. Run the sub-issues individually instead.`,
        };
    }
    let run;
    try {
        run = resolvePhases({
            labels: issue.labels,
            dispatchProfile: request.dispatchProfile,
            defaultProfile: request.defaultProfile,
            modelOverride: request.modelOverride,
        });
    }
    catch (error) {
        return {
            kind: "rejected",
            because: "configuration",
            detail: `sandcastle-agent configuration rejected: ${errorMessage(error)}`,
            cause: error,
        };
    }
    return { kind: "admitted", issue, run };
}
//# sourceMappingURL=issue-intake.mjs.map