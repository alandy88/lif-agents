// Turning a resolved ModelProfile into a running, authenticated agent.
//
// The runtime-carrying sibling of profiles.mts, which stays import-free so
// routing stays testable in isolation. Everything here is keyed off
// `profile.provider` and nothing else, so none of it is repo knowledge — a
// consumer that had to write it would be copying the same block per repo, which
// is how `forwardedEnvKeys` came to forward a credential the kit then expected
// somebody else to consume.

import * as sandcastle from "@ai-hero/sandcastle";
import type { AgentProvider, SandboxProvider } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import type { ModelProfile, Provider } from "./profiles.mts";

/** Construct the agent for one resolved phase profile. */
export function createAgent(profile: ModelProfile): AgentProvider {
  switch (profile.provider) {
    case "claude":
      return sandcastle.claudeCode(profile.model, { effort: profile.effort });
    case "codex":
      return sandcastle.codex(profile.model, { effort: profile.effort });
  }
}

/** The default sandbox; every consumer runs the sibling Docker container. */
export function createSandboxProvider(): SandboxProvider {
  return docker();
}

/**
 * Subscription auth. Each provider CLI can authenticate two ways: a bare token
 * in the environment (which the CLI reads itself, so nothing to do), or the
 * credentials blob `<cli> login` writes to disk. The blob arrives as a forwarded
 * env var — see `forwardedEnvKeys` — and has to be materialized back to the path
 * the CLI looks at.
 *
 * The guard makes the API-key path a no-op rather than an error, so one command
 * covers both auth modes.
 */
const AUTH_SHIM: Record<Provider, string> = {
  // Contents of the ~/.codex/auth.json produced by `codex login`.
  codex:
    `[ -z "$CODEX_AUTH_JSON" ] || ` +
    `(umask 077 && mkdir -p ~/.codex && printf '%s' "$CODEX_AUTH_JSON" > ~/.codex/auth.json)`,
  // Contents of the ~/.claude/.credentials.json produced by `claude login`.
  claude:
    `[ -z "$CLAUDE_CREDENTIALS_JSON" ] || ` +
    `(umask 077 && mkdir -p ~/.claude && printf '%s' "$CLAUDE_CREDENTIALS_JSON" > ~/.claude/.credentials.json)`,
};

/** The CLI each provider shells out to, smoke-checked after auth is in place. */
const CLI_NAME: Record<Provider, string> = {
  codex: "codex",
  claude: "claude",
};

/**
 * Sandbox commands that authenticate the providers a run actually uses, in
 * stable provider order so a resumed run's preflight is byte-identical. A run
 * on the mixed phase map touches both; a `--profile claude` run touches one.
 */
export function providerPreflight(runProfiles: readonly ModelProfile[]): string[] {
  const providers = new Set(runProfiles.map((profile) => profile.provider));
  const commands: string[] = [];
  for (const provider of ["claude", "codex"] as const) {
    if (!providers.has(provider)) continue;
    commands.push(AUTH_SHIM[provider], `${CLI_NAME[provider]} --version`);
  }
  return commands;
}
