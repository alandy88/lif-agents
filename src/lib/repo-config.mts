// The per-repo half of the pipeline contract, in one place.
//
// The split is the PRD's module-boundary test: everything keyed off
// `profile.provider` (agent construction, credential materialization, the CLI
// smoke check) is the kit's, because a consumer writing it would be copying the
// same block into every repo. What is left is what cannot be written without
// naming THIS repo's package manager or test command — and that is exactly this
// interface.
//
// Both shipped presets take the same shape because the reason for each escape
// hatch is the same; `ImplementConfig` and `TaskConfig` are aliases of this.

import type { Toolchain } from "./toolchains.mts";

export interface RepoConfig {
  /**
   * This repo's toolchain. Picking one selects the kit's standard for it —
   * `python` means uv, `node` means npm — which drives the sandbox warm-up and
   * the checks the prompts tell a session to run. The kit owns the commands so
   * three repos cannot drift into three dialects of the same toolchain.
   */
  toolchain: Toolchain;
  /**
   * Checks the toolchain name cannot imply: a second test suite, a generated
   * file to refresh. Appended under the standard block. Not for restating the
   * toolchain's own commands.
   */
  extraConventions?: string;
  /**
   * Sandbox warm-up beyond the toolchain's own, e.g. a docs-generation or
   * generated-file step. The toolchain's commands and provider authentication
   * are both the kit's job — this is only what neither can know.
   */
  preflight?: () => string[];
  /** Workspace-relative template override directory, e.g. `.sandcastle/templates`. */
  templateDir?: string;
}
