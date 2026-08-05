// The harness adapter layer (PRD §5.1): one table mapping a harness name to
// the native CLI arguments that launch it non-interactively.
//
// There is no `bin` field. Herdr launches the binary itself via
// `agent start --kind <kind> -- <args>`, so an adapter's job is only to
// produce the trailing native-args array and to name the kind.

import type { Effort, Harness } from "./types.mts";

export interface HarnessAdapter {
  /** Herdr agent-kind label, passed as `agent start --kind <kind>`. */
  kind: string;
  autonomyFlag: string[];
  modelFlag: (m: string) => string[];
  /** [] when the harness has no stable effort flag — record, don't pass. */
  effortFlag: (e: Effort) => string[];
  env?: Record<string, string>;
}

export interface LaunchOptions {
  model?: string;
  effort?: Effort;
}

// Deliberately partial: an absent entry is the unverified-adapter guard, not an
// oversight. codex/grok/pi/opencode land in M3, each after a live verification
// pass (PRD §7).
export const adapters: Partial<Record<Harness, HarnessAdapter>> = {
  claude: {
    kind: "claude",
    autonomyFlag: ["--dangerously-skip-permissions"],
    modelFlag: (m) => ["--model", m],
    // Claude Code sets reasoning effort through settings and the interactive
    // /effort command, not a stable public launch flag. Passing a guessed flag
    // would abort the launch, so M1 records the request and passes nothing.
    effortFlag: () => [],
  },
};

/**
 * The unverified-adapter guard (PRD §5.1): no entry means refuse to dispatch.
 * Adding a harness is a deliberate act with a verification step, never a
 * silent fallback to some default command shape.
 */
export function resolveAdapter(harness: Harness): HarnessAdapter {
  const adapter = adapters[harness];
  if (!adapter) {
    const verified = Object.keys(adapters).sort().join(", ");
    throw new Error(
      `no verified adapter for harness "${harness}" — refusing to dispatch. Verified harnesses: ${verified}`,
    );
  }
  return adapter;
}

/**
 * Native agent args for `herdr agent start --kind <kind> -- <args>`.
 *
 * An effort the adapter maps to [] is omitted here; store.mts still records the
 * requested effort in task metadata so the profile survives for audit.
 */
export function launchArgs(adapter: HarnessAdapter, options: LaunchOptions = {}): string[] {
  const args = [...adapter.autonomyFlag];
  if (options.model !== undefined) args.push(...adapter.modelFlag(options.model));
  if (options.effort !== undefined) args.push(...adapter.effortFlag(options.effort));
  return args;
}
