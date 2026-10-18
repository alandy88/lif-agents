export type Toolchain = "python" | "node" | "dotnet";
export interface ToolchainSpec {
    /** Commands that warm the sandbox before the first agent turn. */
    preflight: readonly string[];
    /** The canonical "did it pass" command for this toolchain. */
    test: string;
    /** Prompt block: the checks a session runs before committing. */
    conventions: string;
}
export declare const toolchains: {
    readonly python: {
        readonly preflight: readonly ["uv sync"];
        readonly test: "uv run python -m pytest";
        readonly conventions: string;
    };
    readonly node: {
        readonly preflight: readonly ["npm ci"];
        readonly test: "npm test";
        readonly conventions: string;
    };
    readonly dotnet: {
        readonly preflight: readonly ["dotnet restore"];
        readonly test: "dotnet test";
        readonly conventions: string;
    };
};
/**
 * The prompt block for a repo: the toolchain standard, plus any repo-specific
 * checks appended under it.
 *
 * `extra` is for a second test suite or a generated-file step that the
 * toolchain name cannot imply — not for restating the toolchain's own commands
 * in different words.
 */
export declare function renderConventions(toolchain: Toolchain, extra?: string): string;
//# sourceMappingURL=toolchains.d.mts.map