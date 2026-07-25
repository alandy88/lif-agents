// Pure model-profile routing for the sandcastle-agent. This module has no
// Sandcastle/runtime imports so routing decisions can be tested in isolation.

export type Provider = "claude" | "codex";
export type Effort = "low" | "medium" | "high" | "xhigh";

export type ModelProfile = {
  provider: Provider;
  model: string;
  effort?: Effort;
};

export const profiles = {
  claude: {
    provider: "claude",
    model: "claude-sonnet-4-6",
  },
  gpt: {
    provider: "codex",
    model: "gpt-5.4",
    effort: "high",
  },
} as const satisfies Record<string, ModelProfile>;

export type Phase = "plan" | "task" | "review";

/** Opus plans/reviews and Codex builds unless a named profile is forced. */
export const phaseProfiles = {
  plan: { provider: "claude", model: "claude-opus-4-8", effort: "medium" },
  task: { provider: "codex", model: "gpt-5.6-sol", effort: "medium" },
  review: { provider: "claude", model: "claude-opus-4-8", effort: "medium" },
} as const satisfies Record<Phase, ModelProfile>;

export type ProfileName = keyof typeof profiles;

export const DEFAULT_PROFILE_SENTINEL = "default" as const;
export const MIXED_PROFILE_NAME = "mixed" as const;

export const PROFILE_LABELS = {
  claude: "agent:claude",
  gpt: "agent:gpt",
} as const satisfies Record<ProfileName, string>;

const NON_ROUTING_AGENT_LABELS = new Set(["agent:in-progress"]);

export type ProfileResolutionInput = {
  labels?: readonly string[];
  dispatchProfile?: string;
  defaultProfile?: string;
  modelOverride?: string;
};

export type ResolvedProfile = ModelProfile & {
  name: ProfileName;
};

function profileName(value: string, source: string): ProfileName {
  const name = value.trim();
  if (Object.prototype.hasOwnProperty.call(profiles, name)) return name as ProfileName;

  throw new Error(
    `Unknown ${source} "${value}". Available profiles: ${Object.keys(profiles).join(", ")}`,
  );
}

function profileLabels(labels: readonly string[]): {
  selected: ProfileName[];
  unknown: string[];
} {
  const selected = new Set<ProfileName>();
  const unknown: string[] = [];

  for (const label of labels) {
    if (!label.startsWith("agent:") || NON_ROUTING_AGENT_LABELS.has(label)) continue;

    const match = (Object.entries(PROFILE_LABELS) as [ProfileName, string][]).find(
      ([, profileLabel]) => profileLabel === label,
    );
    if (match) selected.add(match[0]);
    else unknown.push(label);
  }

  return { selected: [...selected], unknown };
}

const MODEL_OVERRIDE_PATTERNS: Record<Provider, RegExp> = {
  claude: /^claude-[\w.-]+$/,
  codex: /^(?:gpt-|o\d|codex-)[\w.-]+$/,
};

/**
 * Resolve the optional named profile forced by dispatch, labels, or repository
 * default. `undefined` means use the mixed phase map. Dispatch `mixed`
 * explicitly selects that map and wins over labels/defaults.
 */
function resolveForcedName(input: ProfileResolutionInput): ProfileName | undefined {
  const dispatch = input.dispatchProfile?.trim();
  if (dispatch && dispatch !== DEFAULT_PROFILE_SENTINEL && dispatch !== MIXED_PROFILE_NAME) {
    return profileName(dispatch, "workflow profile");
  }
  if (dispatch === MIXED_PROFILE_NAME) return undefined;

  const fromLabels = profileLabels(input.labels ?? []);
  if (fromLabels.unknown.length > 0) {
    throw new Error(
      `Unknown agent label(s): ${fromLabels.unknown.join(", ")}. Use ${Object.values(PROFILE_LABELS).join(", ")}.`,
    );
  }
  if (fromLabels.selected.length > 1) {
    throw new Error(
      `Issue has multiple agent labels: ${fromLabels.selected.map((name) => PROFILE_LABELS[name]).join(", ")}`,
    );
  }
  if (fromLabels.selected[0]) return fromLabels.selected[0];

  const defaultName = input.defaultProfile?.trim();
  if (!defaultName || defaultName === MIXED_PROFILE_NAME) return undefined;
  return profileName(defaultName, "default profile");
}

function resolvedNamedProfile(name: ProfileName, modelOverride?: string): ResolvedProfile {
  const base = profiles[name];
  const override = modelOverride?.trim();
  if (override && !MODEL_OVERRIDE_PATTERNS[base.provider].test(override)) {
    throw new Error(
      `Model override "${override}" does not look like a ${base.provider} model id ` +
        `(expected ${MODEL_OVERRIDE_PATTERNS[base.provider]})`,
    );
  }
  return { name, ...base, model: override || base.model };
}

/** Resolve one named profile, retaining the historical Claude fallback. */
export function resolveProfile(input: ProfileResolutionInput = {}): ResolvedProfile {
  if (input.dispatchProfile?.trim() === MIXED_PROFILE_NAME) {
    profileName(MIXED_PROFILE_NAME, "workflow profile");
  }
  return resolvedNamedProfile(resolveForcedName(input) ?? "claude", input.modelOverride);
}

export type ResolvedPhases = {
  name: ProfileName | typeof MIXED_PROFILE_NAME;
  phases: Record<Phase, ModelProfile>;
};

/** Resolve dispatch → label → default → mixed, once for all three phases. */
export function resolvePhases(input: ProfileResolutionInput = {}): ResolvedPhases {
  const forced = resolveForcedName(input);
  if (forced) {
    const single = resolvedNamedProfile(forced, input.modelOverride);
    return { name: single.name, phases: { plan: single, task: single, review: single } };
  }

  if (input.modelOverride?.trim()) {
    throw new Error(
      `Model override "${input.modelOverride.trim()}" requires a named profile ` +
        `(the mixed default runs different models per phase)`,
    );
  }
  return { name: MIXED_PROFILE_NAME, phases: phaseProfiles };
}

/** Credential names forwarded for only the providers used by the run. */
export function forwardedEnvKeys(runProfiles: readonly ModelProfile[]): string[] {
  const providers = new Set(runProfiles.map((profile) => profile.provider));
  const keys = ["GH_TOKEN"];
  if (providers.has("claude")) keys.push("CLAUDE_CODE_OAUTH_TOKEN");
  if (providers.has("codex")) keys.push("OPENAI_API_KEY", "CODEX_AUTH_JSON");
  return keys;
}
