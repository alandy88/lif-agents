import {
	createBashToolDefinition, createEditToolDefinition, createFindToolDefinition,
	createGrepToolDefinition, createLsToolDefinition, createPowerShellToolDefinition,
	createReadToolDefinition, createWriteToolDefinition, SettingsManager,
	type ExtensionAPI, type ExtensionContext, type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";

const STATE = "lif-quiet-tools";
const hidden: Component = { render: () => [], invalidate() {} };

// Keep execution and all prompt metadata intact. Only the two display slots change.
export function quietTool<T extends ToolDefinition<any, any, any>>(
	tool: T,
	isQuiet: () => boolean,
	remember: (id: string, invalidate: () => void) => void,
): T {
	return {
		...tool,
		renderShell: "self",
		renderCall(args, theme, context) {
			remember(context.toolCallId, context.invalidate);
			return isQuiet() ? hidden : tool.renderCall!(args, theme, { ...context, lastComponent: undefined });
		},
		renderResult(result, options, theme, context) {
			remember(context.toolCallId, context.invalidate);
			return isQuiet() ? hidden : tool.renderResult!(result, options, theme, { ...context, lastComponent: undefined });
		},
	};
}

export default function (pi: ExtensionAPI) {
	let quiet = true;
	let failures = 0;
	const rows = new Map<string, () => void>();
	const covered = new Set<string>();
	const status = (ctx: ExtensionContext) => {
		ctx.ui.setStatus(STATE, quiet && failures > 0
			? ctx.ui.theme.fg("warning", `Tools: ${failures} failed · /quiet-tools off`)
			: undefined);
	};
	const restore = (ctx: ExtensionContext) => {
		quiet = true;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "custom" && entry.customType === STATE) {
				const data = entry.data as { quiet?: unknown } | undefined;
				if (typeof data?.quiet === "boolean") quiet = data.quiet;
			}
		}
		failures = 0;
		for (const invalidate of [...rows.values()]) invalidate();
		status(ctx);
	};

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		restore(ctx);
		const settings = SettingsManager.create(ctx.cwd, undefined, { projectTrusted: ctx.isProjectTrusted() });
		const tools: ToolDefinition<any, any, any>[] = [
			createReadToolDefinition(ctx.cwd, { autoResizeImages: settings.getImageAutoResize() }),
			createBashToolDefinition(ctx.cwd, {
				commandPrefix: settings.getShellCommandPrefix(), shellPath: settings.getShellPath(),
			}),
			createPowerShellToolDefinition(ctx.cwd), createEditToolDefinition(ctx.cwd),
			createWriteToolDefinition(ctx.cwd), createGrepToolDefinition(ctx.cwd),
			createFindToolDefinition(ctx.cwd), createLsToolDefinition(ctx.cwd),
		];
		const available = pi.getAllTools();
		const active = pi.getActiveTools();
		for (const tool of tools) {
			// Never replace another extension's executor (sandbox, SSH, permissions, etc.).
			if (available.find((candidate) => candidate.name === tool.name)?.sourceInfo.source !== "builtin") continue;
			if (!tool.renderCall || !tool.renderResult) continue;
			pi.registerTool(quietTool(tool, () => quiet, (id, invalidate) => rows.set(id, invalidate)));
			covered.add(tool.name);
		}
		pi.setActiveTools(active);
		const unsupported = active.filter((name) => !covered.has(name));
		ctx.ui.notify(`Quiet tools: built-in text only; images and user ! commands remain visible.${unsupported.length ? ` Unmodified tools: ${unsupported.join(", ")}.` : ""}`, "info");
	});
	pi.registerCommand("quiet-tools", {
		description: "Hide built-in text tool rows: /quiet-tools on|off",
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui") return;
			const value = args.trim();
			if (value !== "on" && value !== "off") {
				ctx.ui.notify(`Quiet tools: ${quiet ? "on" : "off"}. Usage: /quiet-tools on|off`, "info");
				return;
			}
			quiet = value === "on";
			pi.appendEntry(STATE, { quiet });
			for (const invalidate of [...rows.values()]) invalidate();
			status(ctx);
		},
	});
	pi.on("session_tree", (_event, ctx) => { if (ctx.mode === "tui") restore(ctx); });
	pi.on("agent_start", (_event, ctx) => {
		failures = 0;
		if (ctx.mode === "tui") status(ctx);
	});
	pi.on("tool_execution_end", (event, ctx) => {
		if (ctx.mode !== "tui" || !covered.has(event.toolName) || !event.isError) return;
		failures++;
		status(ctx);
	});
	pi.on("session_shutdown", (_event, ctx) => {
		rows.clear();
		covered.clear();
		if (ctx.mode === "tui") ctx.ui.setStatus(STATE, undefined);
	});
}
