// The toolchain standard. A consumer picks a name; the kit owns what that name
// means — the sandbox warm-up, the canonical test command, and the block of
// checks a session is told to run before committing.
//
// This is deliberately opinionated rather than configurable. A free-text
// "conventions" string let every repo invent its own Python story, and the one
// that told an agent to run bare `pytest` instead of `uv run pytest` would fail
// only at runtime, inside an unattended sandbox, as a confusing import error.
// Choosing Python here IS choosing uv.
export const toolchains = {
    python: {
        preflight: ["uv sync"],
        test: "uv run python -m pytest",
        conventions: [
            "- Tests: `uv run python -m pytest`",
            "- Formatting and linting: `uv run pre-commit run --all-files`",
            "",
            "Always run Python tooling through `uv run` — the system Python does not " +
                "have the project dependencies installed.",
        ].join("\n"),
    },
    node: {
        preflight: ["npm ci"],
        test: "npm test",
        conventions: [
            "- Tests: `npm test`",
            "- Types: `npm run typecheck`",
            "- Formatting and linting: `npm run lint`",
            "",
            "Use `npm`, not yarn or pnpm — the lockfile is npm's and a foreign " +
                "installer will rewrite it.",
        ].join("\n"),
    },
    dotnet: {
        preflight: ["dotnet restore"],
        test: "dotnet test",
        conventions: [
            "- Tests: `dotnet test`",
            "- Build: `dotnet build`",
            // Gate form: bare `dotnet format` mutates the tree and exits 0, which
            // teaches an agent nothing. Verify is the check; plain format is the fix.
            "- Formatting gate: `dotnet format --verify-no-changes` (run `dotnet format` to fix)",
        ].join("\n"),
    },
};
/**
 * The prompt block for a repo: the toolchain standard, plus any repo-specific
 * checks appended under it.
 *
 * `extra` is for a second test suite or a generated-file step that the
 * toolchain name cannot imply — not for restating the toolchain's own commands
 * in different words.
 */
export function renderConventions(toolchain, extra) {
    const base = toolchains[toolchain].conventions;
    const trimmed = extra?.trim();
    return trimmed ? `${base}\n${trimmed}` : base;
}
//# sourceMappingURL=toolchains.mjs.map