// Pure model-profile routing for the sandcastle-agent. This module has no
// Sandcastle/runtime imports so routing decisions can be tested in isolation.
/** The agents a run can use — provider + model + effort, each id defined once. */
export const agents = {
    claude: {
        provider: "claude",
        model: "claude-opus-5",
        effort: "medium",
    },
    gpt: {
        provider: "codex",
        model: "gpt-5.6-sol",
        effort: "medium",
    },
};
/**
 * Which agent runs which phase. A named agent's route is the degenerate case
 * where all three phases share it; `mixed` (the default) has Opus plan and
 * review while Codex builds.
 */
export const routes = {
    mixed: { plan: "claude", task: "gpt", review: "claude" },
    claude: { plan: "claude", task: "claude", review: "claude" },
    gpt: { plan: "gpt", task: "gpt", review: "gpt" },
};
/** Dispatch value meaning "no forced route — fall through to labels/default". */
export const DEFAULT_PROFILE_SENTINEL = "default";
// Compatibility aliases predating the agents/routes split. Derived, so model
// ids stay single-sourced; a later release can drop them.
export const profiles = agents;
export const MIXED_PROFILE_NAME = "mixed";
export const phaseProfiles = materialize(routes.mixed);
export const PROFILE_LABELS = {
    claude: "agent:claude",
    gpt: "agent:gpt",
};
const NON_ROUTING_AGENT_LABELS = new Set(["agent:in-progress"]);
function materialize(route) {
    return {
        plan: { ...agents[route.plan] },
        task: { ...agents[route.task] },
        review: { ...agents[route.review] },
    };
}
function routeName(value, source) {
    const name = value.trim();
    if (Object.prototype.hasOwnProperty.call(routes, name))
        return name;
    throw new Error(`Unknown ${source} "${value}". Available profiles: ${Object.keys(routes).join(", ")}`);
}
function profileLabels(labels) {
    const selected = new Set();
    const unknown = [];
    for (const label of labels) {
        if (!label.startsWith("agent:") || NON_ROUTING_AGENT_LABELS.has(label))
            continue;
        const match = Object.entries(PROFILE_LABELS).find(([, profileLabel]) => profileLabel === label);
        if (match)
            selected.add(match[0]);
        else
            unknown.push(label);
    }
    return { selected: [...selected], unknown };
}
const MODEL_OVERRIDE_PATTERNS = {
    claude: /^claude-[\w.-]+$/,
    codex: /^(?:gpt-|o\d|codex-)[\w.-]+$/,
};
/** Resolve the route forced by dispatch, labels, or repository default. */
function resolveRouteName(input) {
    const dispatch = input.dispatchProfile?.trim();
    if (dispatch && dispatch !== DEFAULT_PROFILE_SENTINEL) {
        return routeName(dispatch, "workflow profile");
    }
    const fromLabels = profileLabels(input.labels ?? []);
    if (fromLabels.unknown.length > 0) {
        throw new Error(`Unknown agent label(s): ${fromLabels.unknown.join(", ")}. Use ${Object.values(PROFILE_LABELS).join(", ")}.`);
    }
    if (fromLabels.selected.length > 1) {
        throw new Error(`Issue has multiple agent labels: ${fromLabels.selected.map((name) => PROFILE_LABELS[name]).join(", ")}`);
    }
    if (fromLabels.selected[0])
        return fromLabels.selected[0];
    const defaultName = input.defaultProfile?.trim();
    if (!defaultName)
        return "mixed";
    return routeName(defaultName, "default profile");
}
/** Resolve dispatch → label → default → mixed, once for all three phases. */
export function resolvePhases(input = {}) {
    const name = resolveRouteName(input);
    const route = routes[name];
    const override = input.modelOverride?.trim();
    if (!override)
        return { name, phases: materialize(route) };
    // An override needs a single provider to validate the id against, so the
    // route must use exactly one distinct agent.
    const distinct = [...new Set(Object.values(route))];
    const only = distinct.length === 1 ? distinct[0] : undefined;
    if (!only) {
        throw new Error(`Model override "${override}" requires a single-agent route ` +
            `("${name}" runs different models per phase)`);
    }
    const base = agents[only];
    if (!MODEL_OVERRIDE_PATTERNS[base.provider].test(override)) {
        throw new Error(`Model override "${override}" does not look like a ${base.provider} model id ` +
            `(expected ${MODEL_OVERRIDE_PATTERNS[base.provider]})`);
    }
    const phases = materialize(route);
    phases.plan.model = override;
    phases.task.model = override;
    phases.review.model = override;
    return { name, phases };
}
/**
 * One line naming the models a run uses, for logs, comments, and the PR body.
 * Pass `phases` when a lifecycle runs a subset — the task preset has no plan
 * phase, and advertising one misdescribes the run.
 */
export function describeRun(run, phases = ["plan", "task", "review"]) {
    const singleAgent = new Set(Object.values(routes[run.name])).size === 1;
    if (singleAgent)
        return `${run.name} → ${run.phases.task.model}`;
    const labels = { plan: "plan", task: "tasks", review: "review" };
    const parts = phases.map((phase) => `${labels[phase]} ${run.phases[phase].model}`);
    return `${run.name} → ${parts.join(", ")}`;
}
/**
 * Credential names forwarded for only the providers used by the run. Each
 * provider has both a bare-token form the CLI reads itself and a
 * `<cli> login` credentials blob that `providerPreflight` materializes to disk;
 * both are forwarded, and whichever is set wins.
 */
export function forwardedEnvKeys(runProfiles) {
    const providers = new Set(runProfiles.map((profile) => profile.provider));
    const keys = ["GH_TOKEN"];
    if (providers.has("claude"))
        keys.push("CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CREDENTIALS_JSON");
    if (providers.has("codex"))
        keys.push("OPENAI_API_KEY", "CODEX_AUTH_JSON");
    return keys;
}
//# sourceMappingURL=profiles.mjs.map