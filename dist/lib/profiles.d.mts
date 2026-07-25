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
        readonly model: "claude-sonnet-4-6";
    };
    readonly gpt: {
        readonly provider: "codex";
        readonly model: "gpt-5.4";
        readonly effort: "high";
    };
};
export type Phase = "plan" | "task" | "review";
/** Opus plans/reviews and Codex builds unless a named profile is forced. */
export declare const phaseProfiles: {
    readonly plan: {
        readonly provider: "claude";
        readonly model: "claude-opus-4-8";
        readonly effort: "medium";
    };
    readonly task: {
        readonly provider: "codex";
        readonly model: "gpt-5.6-sol";
        readonly effort: "medium";
    };
    readonly review: {
        readonly provider: "claude";
        readonly model: "claude-opus-4-8";
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
/** Credential names forwarded for only the providers used by the run. */
export declare function forwardedEnvKeys(runProfiles: readonly ModelProfile[]): string[];
//# sourceMappingURL=profiles.d.mts.map