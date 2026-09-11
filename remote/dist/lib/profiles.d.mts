export type Provider = "claude" | "codex";
export type Effort = "low" | "medium" | "high" | "xhigh";
export type ModelProfile = {
    provider: Provider;
    model: string;
    effort?: Effort;
};
/** The agents a run can use — provider + model + effort, each id defined once. */
export declare const agents: {
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
export type AgentName = keyof typeof agents;
export type Phase = "plan" | "task" | "review";
/**
 * Which agent runs which phase. A named agent's route is the degenerate case
 * where all three phases share it; `mixed` (the default) has Opus plan and
 * review while Codex builds.
 */
export declare const routes: {
    readonly mixed: {
        readonly plan: "claude";
        readonly task: "gpt";
        readonly review: "claude";
    };
    readonly claude: {
        readonly plan: "claude";
        readonly task: "claude";
        readonly review: "claude";
    };
    readonly gpt: {
        readonly plan: "gpt";
        readonly task: "gpt";
        readonly review: "gpt";
    };
};
export type RouteName = keyof typeof routes;
/** Dispatch value meaning "no forced route — fall through to labels/default". */
export declare const DEFAULT_PROFILE_SENTINEL: "default";
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
export type ProfileName = AgentName;
export declare const MIXED_PROFILE_NAME: "mixed";
export declare const phaseProfiles: Record<Phase, ModelProfile>;
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
export type ResolvedPhases = {
    name: RouteName;
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