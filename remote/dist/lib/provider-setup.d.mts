import type { AgentProvider, SandboxProvider } from "@ai-hero/sandcastle";
import type { ModelProfile } from "./profiles.mts";
/** Construct the agent for one resolved phase profile. */
export declare function createAgent(profile: ModelProfile): AgentProvider;
/** The default sandbox; every consumer runs the sibling Docker container. */
export declare function createSandboxProvider(): SandboxProvider;
/**
 * Sandbox commands that authenticate the providers a run actually uses, in
 * stable provider order so a resumed run's preflight is byte-identical. A run
 * on the mixed phase map touches both; a `--profile claude` run touches one.
 */
export declare function providerPreflight(runProfiles: readonly ModelProfile[]): string[];
//# sourceMappingURL=provider-setup.d.mts.map