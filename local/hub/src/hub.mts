// The pipeline behind both the CLI and the hub page: load config, list the
// backend's repos, classify a message, assemble the prompt, launch the worktree.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { backendName, worktreeName } from "./backend.mts";
import type { Backend, LaunchResult, LaunchSpec, Repo } from "./backend.mts";
import { applyOverrides, buildClassifierPrompt, parseClassification } from "./classify.mts";
import type { Classification, Profiles } from "./classify.mts";
import { createHerdrBackend } from "./herdr.mts";
import { launchLogPath, openLaunchLog } from "./launches.mts";
import type { LaunchLog } from "./launches.mts";
import { createOrcaBackend } from "./orca.mts";
import { assemblePrompt, parsePromptSections } from "./prompts.mts";

export interface Overrides {
  mode?: string;
  domain?: string;
  repo?: string;
}

export interface Routed {
  classification: Classification;
  prompt: string;
  spec: LaunchSpec;
}

export interface Hub {
  profiles: Profiles;
  backend: Backend;
  launches: LaunchLog;
  repos(): Repo[];
  route(message: string, overrides: Overrides, activate?: boolean): Routed;
  launch(spec: LaunchSpec, message: string, classification: Classification): LaunchResult;
}

function expandEnv(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, name: string) => {
    const v = env[name];
    if (!v) throw new Error(`profiles.json needs $${name}, which is not set in this shell`);
    return v;
  });
}

export function loadProfiles(env: NodeJS.ProcessEnv): Profiles {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const raw = JSON.parse(fs.readFileSync(path.join(here, "..", "profiles.json"), "utf8")) as Profiles;
  raw.promptsFile = expandEnv(raw.promptsFile, env);
  raw.repoIndex = expandEnv(raw.repoIndex, env);
  return raw;
}

export function selectBackend(env: NodeJS.ProcessEnv, override?: string): Backend {
  return backendName(env, override) === "herdr" ? createHerdrBackend(env) : createOrcaBackend(env);
}

export function runClassifier(model: string, prompt: string): string {
  const result = spawnSync("claude", ["-p", "--model", model, "--output-format", "json", prompt], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw new Error(`could not run claude: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`claude -p exited ${result.status}: ${result.stderr.slice(0, 500)}`);
  const parsed = JSON.parse(result.stdout) as { result?: string; is_error?: boolean };
  if (parsed.is_error || typeof parsed.result !== "string") {
    throw new Error(`claude -p returned no result: ${result.stdout.slice(0, 300)}`);
  }
  return parsed.result;
}

export function titleFromMessage(message: string): string {
  return (
    message.toLowerCase().replace(/[^a-z0-9]+/g, "-").split("-").filter(Boolean).slice(0, 4).join("-") || "task"
  );
}

export function createHub(env: NodeJS.ProcessEnv = process.env, backendOverride?: string): Hub {
  const profiles = loadProfiles(env);
  const backend = selectBackend(env, backendOverride);
  const launches = openLaunchLog(launchLogPath(env));
  let repoCache: Repo[] | null = null;
  const repos = (): Repo[] => (repoCache ??= backend.repos());

  return {
    profiles,
    backend,
    launches,
    repos,
    route(message, overrides, activate = true) {
      const all = repos();
      const repoNames = all.map((r) => r.displayName);
      let classification: Classification;
      if (overrides.mode && overrides.repo) {
        classification = { mode: overrides.mode, domain: null, repo: overrides.repo, title: titleFromMessage(message) };
      } else {
        const repoIndex = fs.readFileSync(profiles.repoIndex, "utf8");
        const raw = runClassifier(
          profiles.classifierModel,
          buildClassifierPrompt(profiles, repoNames, repoIndex, message),
        );
        classification = parseClassification(raw, profiles, repoNames);
      }
      classification = applyOverrides(classification, overrides, profiles, repoNames);

      const sections = parsePromptSections(fs.readFileSync(profiles.promptsFile, "utf8"));
      const modeProfile = profiles.modes[classification.mode];
      if (!modeProfile) throw new Error(`unknown mode "${classification.mode}"`);
      const prompt = assemblePrompt({
        sections,
        baseSection: profiles.baseSection,
        modeSection: modeProfile.section,
        domainSection: classification.domain ? modeProfile.domains[classification.domain]?.section : undefined,
        task: message,
      });
      const repo = all.find((r) => r.displayName === classification.repo);
      if (!repo) throw new Error(`repo "${classification.repo}" is unknown to ${backend.name}`);
      return {
        classification,
        prompt,
        spec: { repoPath: repo.path, name: worktreeName(classification.title), agent: profiles.agent, prompt, activate },
      };
    },
    launch(spec, message, classification): LaunchResult {
      const launched = backend.launch(spec);
      launches.add({
        backend: backend.name,
        message,
        mode: classification.mode,
        domain: classification.domain,
        repo: classification.repo,
        name: spec.name,
        ...launched,
      });
      return launched;
    },
  };
}
