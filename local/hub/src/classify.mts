// Turns a free-text message into {mode, domain, repo, title} using a small
// model, with a strict JSON contract so a bad answer fails loudly.

export interface ModeProfile {
  section: string;
  describe: string;
  /** Claude Code `--model` / `--effort` for agents started in this mode; unset means the agent's own default. */
  model?: string;
  effort?: string;
  domains: Record<string, { section: string; describe: string }>;
}

export interface Profiles {
  promptsFile: string;
  repoIndex: string;
  baseSection: string;
  defaultRepo: string;
  agent: string;
  classifierModel: string;
  /** Choices the page offers; the CLI accepts anything. */
  models: string[];
  efforts: string[];
  modes: Record<string, ModeProfile>;
}

export interface Classification {
  mode: string;
  domain: string | null;
  repo: string;
  /** 2-5 lowercase words joined by "-", used as the worktree name. */
  title: string;
}

export function buildClassifierPrompt(
  profiles: Profiles,
  repoNames: readonly string[],
  repoIndexMarkdown: string,
  message: string,
): string {
  const modeLines = Object.entries(profiles.modes).map(([key, m]) => {
    const domains = Object.entries(m.domains)
      .map(([d, v]) => `      - ${d}: ${v.describe}`)
      .join("\n");
    return `  - ${key}: ${m.describe}${domains ? `\n    domains:\n${domains}` : ""}`;
  });
  return [
    "You route a message from Peter to an agent session. Reply with one JSON object and nothing else.",
    "",
    "Modes (pick exactly one):",
    ...modeLines,
    "",
    `Repos (pick exactly one displayName; default "${profiles.defaultRepo}" when the message is not about a specific project):`,
    ...repoNames.map((r) => `  - ${r}`),
    "",
    "What each repo is for:",
    repoIndexMarkdown.trim(),
    "",
    "Rules:",
    "- domain must be one of the listed domains for the chosen mode, or null.",
    "- Questions, musings, and 'what do you think' are explore. 'Plan', 'spec', 'design' are plan.",
    "- 'Check', 'test', 'review', 'is it green' are verify. 'Ship', 'deploy', 'install on' are deploy.",
    "- Everything else that asks for a change is exec.",
    "- title: 2 to 5 lowercase words joined by '-', no other characters.",
    "",
    'Output shape: {"mode":"...","domain":"..."|null,"repo":"...","title":"..."}',
    "",
    "Message:",
    message.trim(),
  ].join("\n");
}

const TITLE_RE = /^[a-z0-9]+(?:-[a-z0-9]+){1,4}$/;

export function parseClassification(
  raw: string,
  profiles: Profiles,
  repoNames: readonly string[],
): Classification {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(`classifier returned no JSON: ${raw.slice(0, 200)}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch (error) {
    throw new Error(`classifier JSON did not parse: ${(error as Error).message}`);
  }
  const obj = parsed as Record<string, unknown>;
  const mode = String(obj.mode ?? "");
  const profile = profiles.modes[mode];
  if (!profile) throw new Error(`classifier chose unknown mode "${mode}"`);
  const domainRaw = obj.domain;
  const domain = domainRaw == null || domainRaw === "" ? null : String(domainRaw);
  if (domain !== null && !profile.domains[domain]) {
    throw new Error(`classifier chose domain "${domain}" which mode "${mode}" does not have`);
  }
  const repo = String(obj.repo ?? "");
  if (!repoNames.includes(repo)) throw new Error(`classifier chose unknown repo "${repo}"`);
  let title = String(obj.title ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!TITLE_RE.test(title)) title = title.split("-").filter(Boolean).slice(0, 5).join("-") || "task";
  return { mode, domain, repo, title };
}

export function applyOverrides(
  base: Classification,
  overrides: { mode?: string; domain?: string; repo?: string },
  profiles: Profiles,
  repoNames: readonly string[],
): Classification {
  const next = { ...base };
  if (overrides.mode) {
    if (!profiles.modes[overrides.mode]) throw new Error(`unknown mode "${overrides.mode}"`);
    next.mode = overrides.mode;
  }
  const modeProfile = profiles.modes[next.mode];
  if (!modeProfile) throw new Error(`unknown mode "${next.mode}"`);
  if (overrides.mode && !modeProfile.domains[next.domain ?? ""]) next.domain = null;
  if (overrides.domain !== undefined) {
    const d = overrides.domain === "" || overrides.domain === "none" ? null : overrides.domain;
    if (d !== null && !modeProfile.domains[d]) {
      throw new Error(`mode "${next.mode}" has no domain "${d}"`);
    }
    next.domain = d;
  }
  if (overrides.repo) {
    if (!repoNames.includes(overrides.repo)) throw new Error(`unknown repo "${overrides.repo}"`);
    next.repo = overrides.repo;
  }
  return next;
}
