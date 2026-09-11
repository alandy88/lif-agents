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
export declare function templatePath(name: string, options?: TemplatePathOptions): string;
//# sourceMappingURL=templates.d.mts.map