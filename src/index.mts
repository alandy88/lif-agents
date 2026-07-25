export { templatePath } from "./lib/templates.mjs";
export type { TemplatePathOptions } from "./lib/templates.mjs";

// P1 lands here: host-exec, task-list, task-loop, profiles, github-issue, defang.
// Presets (implement, task) land in ./presets and are imported by path, not re-exported.
