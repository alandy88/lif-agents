export { templatePath } from "./lib/templates.mts";
export type { TemplatePathOptions } from "./lib/templates.mts";

export { capture, ghCapture, ghJson, hostGit, json } from "./lib/host-exec.mts";
export type { CaptureResult } from "./lib/host-exec.mts";

export { defangPromptArgs, defangShellExpansion } from "./lib/defang.mts";

export { isEntrypoint } from "./lib/entrypoint.mts";

export { renderConventions, toolchains } from "./lib/toolchains.mts";
export type { Toolchain, ToolchainSpec } from "./lib/toolchains.mts";

export {
  checkOffTask,
  parseTaskDoneTrailers,
  parseTaskList,
  renderTaskList,
  stripTaskSection,
  taskDoneTrailer,
} from "./lib/task-list.mts";
export type { TaskItem } from "./lib/task-list.mts";

export { ensureTaskList, runTaskLoop } from "./lib/task-loop.mts";
export type { TaskLoopDeps, TaskLoopResult } from "./lib/task-loop.mts";

export {
  DEFAULT_PROFILE_SENTINEL,
  forwardedEnvKeys,
  MIXED_PROFILE_NAME,
  phaseProfiles,
  PROFILE_LABELS,
  profiles,
  resolvePhases,
  resolveProfile,
} from "./lib/profiles.mts";
export type {
  Effort,
  ModelProfile,
  Phase,
  ProfileName,
  ProfileResolutionInput,
  Provider,
  ResolvedPhases,
  ResolvedProfile,
} from "./lib/profiles.mts";

export {
  createAgent,
  createSandboxProvider,
  providerPreflight,
} from "./lib/provider-setup.mts";

export {
  commentOnIssue,
  getIssue,
  githubIssueSource,
  issueIsEpic,
  setIssueBody,
} from "./lib/github-issue.mts";
export type { Issue, IssueBodySource } from "./lib/github-issue.mts";

// Presets (implement, task) land in ./presets and are imported by path, not re-exported.
