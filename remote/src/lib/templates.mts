import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path to the kit's bundled `templates/` directory. */
const TEMPLATE_ROOT = fileURLToPath(new URL("../../templates/", import.meta.url));

export interface TemplatePathOptions {
  /**
   * Workspace root the returned path is relative to. Defaults to `process.cwd()`,
   * which on both the host runner and inside the sandbox is the repo root.
   */
  workspaceRoot?: string;
  /**
   * Repo-local override directory, workspace-relative (e.g. `.sandcastle/templates`).
   * If `<overrideDir>/<name>` exists, it wins over the kit default.
   */
  overrideDir?: string;
}

/**
 * Resolve a prompt template to a **workspace-relative** path, as sandcastle's
 * `promptFile` requires.
 *
 * Decision D1(b): defaults are read in place from `node_modules/@lif/sandcastle-kit/
 * templates/`, not copied into the repo. That makes two things load-bearing —
 * `node_modules` must sit inside the mounted workspace, and install must have run
 * before the first template read. Both hold for the current Dockerfile mounts.
 *
 * @param name Template path under `templates/`, e.g. `implement/task-prompt.md`.
 */
export function templatePath(name: string, options: TemplatePathOptions = {}): string {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();

  if (options.overrideDir) {
    const override = path.posix.join(toPosix(options.overrideDir), name);
    if (existsSync(path.resolve(workspaceRoot, override))) return override;
  }

  const absolute = path.resolve(TEMPLATE_ROOT, name);
  const relative = toPosix(path.relative(workspaceRoot, absolute));

  if (relative.startsWith("../") || path.isAbsolute(relative)) {
    throw new Error(
      `Template "${name}" resolves outside the workspace (${relative}). ` +
        `The kit must be installed into node_modules under ${workspaceRoot}.`,
    );
  }
  return relative;
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}
