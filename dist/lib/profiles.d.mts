export type Provider = "claude" | "codex";
export type Effort = "low" | "medium" | "high" | "xhigh";
export type ModelProfile = {
    provider: Provider;
    model: string;
    effort?: Effort;
};
export declare const profiles: {
    readonly claude: {
        readonly provider: "claude";
        readonly model: "claude-opus-5";
        readonly effort: "medium";
    };
    readonly gpt: {
        readonly provider: "codex";
        readonly model: "gpt-5.6-sol";
        readonly effort: "medium";
    };
};
export type Phase = "plan" | "task" | "review";
/** Opus plans/reviews and Codex builds unless a named profile is forced. */
export declare const phaseProfiles: {
    readonly plan: {
        readonly provider: "claude";
        readonly model: "claude-opus-5";
        readonly effort: "medium";
    };
    readonly task: {
        readonly provider: "codex";
        readonly model: "gpt-5.6-sol";
        readonly effort: "medium";
    };
    readonly review: {
        readonly provider: "claude";
        readonly model: "claude-opus-5";
        readonly effort: "medium";
    };
};
export type ProfileName = keyof typeof profiles;
export declare const DEFAULT_PROFILE_SENTINEL: "default";
export declare const MIXED_PROFILE_NAME: "mixed";
export declare const PROFILE_LABELS: {
    readonly claude: "agent:claude";
    readonly gpt: "agent:gpt";
};
export type ProfileResolutionInput = {
    labels?: readonly string[];
    dispatchProfile?: string;
    defaultProfile?: string;
    modelOverride?: string;
};
export type ResolvedProfile = ModelProfile & {
    name: ProfileName;
};
/** Resolve one named profile, retaining the historical Claude fallback. */
export declare function resolveProfile(input?: ProfileResolutionInput): ResolvedProfile;
export type ResolvedPhases = {
    name: ProfileName | typeof MIXED_PROFILE_NAME;
    phases: Record<Phase, ModelProfile>;
};
/** Resolve dispatch → label → default → mixed, once for all three phases. */
export declare function resolvePhases(input?: ProfileResolutionInput): ResolvedPhases;
/**
 * One line naming the models a run uses, for logs, comments, and the PR body.
 * Pass `phases` when a lifecycle runs a subset — the task preset has no plan
 * phase, and advertising one misdescribes the run.
 */
export declare function describeRun(run: ResolvedPhases, phases?: readonly Phase[]): string;
/**
 * Credential names forwarded for only the providers used by the run. Each
 * provider has both a bare-token form the CLI reads itself and a
 * `<cli> login` credentials blob that `providerPreflight` materializes to disk;
 * both are forwarded, and whichever is set wins.
 */
export declare function forwardedEnvKeys(runProfiles: readonly ModelProfile[]): string[];
//# sourceMappingURL=profiles.d.mts.map