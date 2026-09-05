import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type QuotaProviderId = "claude" | "codex" | "cursor" | "copilot" | "grok" | "kimi";

type Theme = ExtensionContext["ui"]["theme"];
type ModelIdentity = { provider: string; id: string };

export interface ContextSnapshot {
	tokens: number | null;
	contextWindow: number;
	percent: number | null;
}

export interface QuotaWindowSnapshot {
	id: string;
	kind: "session" | "weekly" | "monthly" | "model" | "credits" | "unknown";
	percentRemaining?: number;
	windowSeconds?: number;
}

export interface QuotaAvailabilitySnapshot {
	scope: string;
	status: "known" | "unknown";
	effectivePercentRemaining?: number;
	boundedBy: string[];
}

export interface QuotaProviderSnapshot {
	provider: string;
	stateStatus: string;
	stale: boolean;
	windows: QuotaWindowSnapshot[];
	availability: QuotaAvailabilitySnapshot[];
}

export interface QuotaReportSnapshot {
	providers: QuotaProviderSnapshot[];
}

export interface QuotaSelection {
	provider?: QuotaProviderId;
	fiveHour?: QuotaWindowSnapshot;
	weekly?: QuotaWindowSnapshot;
}

export interface InferenceTimingSnapshot {
	requestStartedAt: number;
	firstOutputAt: number;
	completedAt: number;
}

export interface InferenceUsageSnapshot {
	input: number;
	cacheRead: number;
	cacheWrite: number;
	output: number;
}

export interface InferenceSpeedSnapshot {
	inputTokensPerSecond: number;
	outputTokensPerSecond: number;
}

const THINKING_THEME_TOKEN = {
	off: "thinkingOff",
	minimal: "thinkingMinimal",
	low: "thinkingLow",
	medium: "thinkingMedium",
	high: "thinkingHigh",
	xhigh: "thinkingXhigh",
	max: "thinkingMax",
} as const;

const QUOTA_PROVIDER_BY_PI_PROVIDER: Readonly<Record<string, QuotaProviderId>> = {
	// These are explicit provider identities, not model-id patterns. quota-axi's
	// documented provider notes identify Pi's anthropic, xai, and kimi-coding
	// credentials with its claude, grok, and kimi quota sources respectively.
	anthropic: "claude",
	"openai-codex": "codex",
	cursor: "cursor",
	"github-copilot": "copilot",
	xai: "grok",
	"kimi-coding": "kimi",
};

const WINDOW_KINDS = new Set<QuotaWindowSnapshot["kind"]>([
	"session",
	"weekly",
	"monthly",
	"model",
	"credits",
	"unknown",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function finiteNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asWindow(value: unknown): QuotaWindowSnapshot | undefined {
	if (!isRecord(value) || typeof value.id !== "string" || typeof value.kind !== "string") return undefined;
	if (!WINDOW_KINDS.has(value.kind as QuotaWindowSnapshot["kind"])) return undefined;

	const window: QuotaWindowSnapshot = {
		id: value.id,
		kind: value.kind as QuotaWindowSnapshot["kind"],
	};
	const percentRemaining = finiteNumber(value.percentRemaining);
	const windowSeconds = finiteNumber(value.windowSeconds);
	if (percentRemaining !== undefined) window.percentRemaining = percentRemaining;
	if (windowSeconds !== undefined) window.windowSeconds = windowSeconds;
	return window;
}

function asAvailability(value: unknown): QuotaAvailabilitySnapshot | undefined {
	if (!isRecord(value) || typeof value.scope !== "string" || typeof value.status !== "string") return undefined;
	if (value.status !== "known" && value.status !== "unknown") return undefined;
	if (!Array.isArray(value.boundedBy) || !value.boundedBy.every((id) => typeof id === "string")) return undefined;

	const availability: QuotaAvailabilitySnapshot = {
		scope: value.scope,
		status: value.status,
		boundedBy: [...value.boundedBy],
	};
	const effectivePercentRemaining = finiteNumber(value.effectivePercentRemaining);
	if (effectivePercentRemaining !== undefined) {
		availability.effectivePercentRemaining = effectivePercentRemaining;
	}
	return availability;
}

/**
 * Parse and immediately reduce quota-axi JSON to the non-secret fields the footer needs.
 * Account identity, source attempts, errors, and any other fields are never retained.
 */
export function parseQuotaReport(text: string): QuotaReportSnapshot | undefined {
	try {
		const value: unknown = JSON.parse(text);
		if (
			!isRecord(value) ||
			(value.schemaVersion !== 3 && value.schemaVersion !== 5) ||
			!Array.isArray(value.providers)
		) return undefined;

		const providers: QuotaProviderSnapshot[] = [];
		for (const rawProvider of value.providers) {
			if (!isRecord(rawProvider) || typeof rawProvider.provider !== "string") continue;
			const rawState = isRecord(rawProvider.state) ? rawProvider.state : undefined;
			if (!rawState || typeof rawState.status !== "string" || typeof rawState.stale !== "boolean") continue;

			const windows = Array.isArray(rawProvider.windows)
				? rawProvider.windows.map(asWindow).filter((window): window is QuotaWindowSnapshot => window !== undefined)
				: [];
			const rawSemantics = isRecord(rawProvider.quotaSemantics) ? rawProvider.quotaSemantics : undefined;
			const availability = rawSemantics && Array.isArray(rawSemantics.effectiveAvailability)
				? rawSemantics.effectiveAvailability
						.map(asAvailability)
						.filter((entry): entry is QuotaAvailabilitySnapshot => entry !== undefined)
				: [];
			providers.push({
				provider: rawProvider.provider,
				stateStatus: rawState.status,
				stale: rawState.stale,
				windows,
				availability,
			});
		}
		return { providers };
	} catch {
		return undefined;
	}
}

export function quotaProviderForModel(model: ModelIdentity | undefined): QuotaProviderId | undefined {
	return model ? QUOTA_PROVIDER_BY_PI_PROVIDER[model.provider] : undefined;
}

function isFiveHourWindow(window: QuotaWindowSnapshot): boolean {
	return (
		(window.id === "five_hour" && window.kind === "session") ||
		window.windowSeconds === 18_000
	);
}

function isWeeklyWindow(window: QuotaWindowSnapshot): boolean {
	return window.kind === "weekly" || window.windowSeconds === 604_800;
}

function lowestRemaining(windows: QuotaWindowSnapshot[]): QuotaWindowSnapshot | undefined {
	return windows
		.filter((window) => window.percentRemaining !== undefined)
		.sort((a, b) => (a.percentRemaining ?? Infinity) - (b.percentRemaining ?? Infinity))[0];
}

/**
 * Select only windows named by quota-axi's proven effective relationship for this model.
 * Exact model scopes win; an unresolved exact scope never falls back to an account scope.
 */
export function selectQuota(report: QuotaReportSnapshot | undefined, model: ModelIdentity | undefined): QuotaSelection {
	const provider = quotaProviderForModel(model);
	if (!report || !provider || !model) return {};

	const providerSnapshot = report.providers.find((candidate) => candidate.provider === provider);
	if (!providerSnapshot || providerSnapshot.stateStatus !== "fresh" || providerSnapshot.stale) {
		return { provider };
	}

	const exactScopes = new Set([`model:${model.id}`, `product:${model.id}`]);
	const broadScopes = new Set(["all_models", "all_products"]);
	const exact = providerSnapshot.availability.find((entry) => exactScopes.has(entry.scope));
	const broad = providerSnapshot.availability.find((entry) => broadScopes.has(entry.scope));
	const availability = exact ?? broad;
	if (!availability || availability.status !== "known") return { provider };

	const bounded = new Set(availability.boundedBy);
	const applicableWindows = providerSnapshot.windows.filter((window) => bounded.has(window.id));
	return {
		provider,
		fiveHour: lowestRemaining(applicableWindows.filter(isFiveHourWindow)),
		weekly: lowestRemaining(applicableWindows.filter(isWeeklyWindow)),
	};
}

function clampPercent(value: number): number {
	return Math.max(0, Math.min(100, value));
}

function formatPercent(value: number): string {
	return `${Math.round(clampPercent(value))}%`;
}

export function calculateInferenceSpeed(
	timing: InferenceTimingSnapshot,
	usage: InferenceUsageSnapshot,
): InferenceSpeedSnapshot | undefined {
	const inputSeconds = (timing.firstOutputAt - timing.requestStartedAt) / 1_000;
	const outputSeconds = (timing.completedAt - timing.firstOutputAt) / 1_000;
	if (inputSeconds <= 0 || outputSeconds <= 0) return undefined;

	const inputTokens = usage.input + usage.cacheRead + usage.cacheWrite;
	if (inputTokens < 0 || usage.output < 0) return undefined;
	return {
		inputTokensPerSecond: inputTokens / inputSeconds,
		outputTokensPerSecond: usage.output / outputSeconds,
	};
}

export function formatTokens(value: number): string {
	const rounded = Math.max(0, Math.round(value));
	if (rounded < 1_000) return String(rounded);
	if (rounded < 1_000_000) {
		const thousands = rounded / 1_000;
		return `${thousands >= 10 ? Math.round(thousands) : Number(thousands.toFixed(1))}k`;
	}
	const millions = rounded / 1_000_000;
	return `${millions >= 10 ? Math.round(millions) : Number(millions.toFixed(1))}m`;
}

function contextColor(percent: number): "success" | "warning" | "error" {
	if (percent < 60) return "success";
	if (percent < 80) return "warning";
	return "error";
}

function quotaColor(percent: number): "success" | "warning" | "error" {
	if (percent > 50) return "success";
	if (percent >= 20) return "warning";
	return "error";
}

function contextSegment(context: ContextSnapshot | undefined, theme: Theme, compact: boolean): string {
	if (!context || context.tokens === null || !Number.isFinite(context.tokens) || context.contextWindow <= 0) {
		return theme.fg("muted", "ctx unavailable");
	}
	const derivedPercent = (context.tokens / context.contextWindow) * 100;
	const percent = clampPercent(
		context.percent !== null && Number.isFinite(context.percent) ? context.percent : derivedPercent,
	);
	const percentage = formatPercent(percent);
	const absolute = `${formatTokens(context.tokens)}/${formatTokens(context.contextWindow)}`;
	return theme.fg(contextColor(percent), compact ? `ctx ${percentage} ${absolute}` : `ctx ${percentage} · ${absolute}`);
}

function quotaSegment(
	label: "5h" | "week",
	window: QuotaWindowSnapshot | undefined,
	theme: Theme,
	compact: boolean,
): string {
	if (window?.percentRemaining === undefined || !Number.isFinite(window.percentRemaining)) {
		return theme.fg("muted", `${label} unavailable`);
	}
	const remaining = clampPercent(window.percentRemaining);
	return theme.fg(quotaColor(remaining), `${label} ${formatPercent(remaining)}${compact ? "" : " left"}`);
}

function speedSegment(label: "In" | "Out", value: number, theme: Theme): string {
	return theme.fg("muted", `${label} ${formatTokens(value)}t/s`);
}

function joinSegments(segments: string[], separator: string): string {
	return segments.join(separator);
}

function fitSegments(segments: string[], separator: string, width: number): string {
	const full = joinSegments(segments, separator);
	if (visibleWidth(full) <= width) return full;

	// Preserve every semantic segment by shortening the model before applying a
	// final ANSI-aware truncation. Compact labels are applied before this step.
	const tail = joinSegments(segments.slice(1), separator);
	const modelBudget = width - visibleWidth(separator) - visibleWidth(tail);
	if (modelBudget > 0) {
		const shortModel = truncateToWidth(segments[0] ?? "", modelBudget, "");
		const fitted = `${shortModel}${separator}${tail}`;
		if (visibleWidth(fitted) <= width) return fitted;
	}
	return truncateToWidth(full, width, "");
}

export interface FooterSnapshot {
	modelId: string | undefined;
	thinkingLevel: string | undefined;
	context: ContextSnapshot | undefined;
	quota: QuotaSelection;
	speed?: InferenceSpeedSnapshot;
}

export function formatFooterLine(snapshot: FooterSnapshot, theme: Theme, suppliedWidth: number): string {
	const width = Math.max(0, Math.floor(suppliedWidth));
	if (width === 0) return "";

	const model = theme.fg("borderAccent", snapshot.modelId || "no model");
	const thinkingLevel = (snapshot.thinkingLevel ?? "off") as ThinkingLevel;
	const thinkingToken = THINKING_THEME_TOKEN[thinkingLevel] ?? THINKING_THEME_TOKEN.off;
	const effort = theme.fg(thinkingToken, snapshot.thinkingLevel || "off");
	const separator = theme.fg("dim", " │ ");
	const fullSegments = [
		model,
		effort,
		contextSegment(snapshot.context, theme, false),
		...(snapshot.speed ? [
			speedSegment("In", snapshot.speed.inputTokensPerSecond, theme),
			speedSegment("Out", snapshot.speed.outputTokensPerSecond, theme),
		] : []),
		...(snapshot.quota.fiveHour ? [quotaSegment("5h", snapshot.quota.fiveHour, theme, false)] : []),
		quotaSegment("week", snapshot.quota.weekly, theme, false),
	];
	const full = joinSegments(fullSegments, separator);
	if (visibleWidth(full) <= width) return full;

	const compactSegments = [
		model,
		effort,
		contextSegment(snapshot.context, theme, true),
		...(snapshot.speed ? [
			speedSegment("In", snapshot.speed.inputTokensPerSecond, theme),
			speedSegment("Out", snapshot.speed.outputTokensPerSecond, theme),
		] : []),
		...(snapshot.quota.fiveHour ? [quotaSegment("5h", snapshot.quota.fiveHour, theme, true)] : []),
		quotaSegment("week", snapshot.quota.weekly, theme, true),
	];
	const compactSeparator = theme.fg("dim", "│");
	const compact = joinSegments(compactSegments, compactSeparator);
	if (visibleWidth(compact) <= width) return compact;
	return fitSegments(compactSegments, compactSeparator, width);
}

export default function (pi: ExtensionAPI) {
	let sessionController: AbortController | undefined;
	let quotaReport: QuotaReportSnapshot | undefined;
	let activeRequestRender: (() => void) | undefined;
	let refreshInFlight = false;
	let refreshQueued = false;
	let requestStartedAt: number | undefined;
	let firstOutputAt: number | undefined;
	let inferenceSpeed: InferenceSpeedSnapshot | undefined;

	const requestRender = () => {
		activeRequestRender?.();
	};

	const refreshQuota = async (ctx: ExtensionContext): Promise<void> => {
		const controller = sessionController;
		if (!controller) return;
		if (refreshInFlight) {
			refreshQueued = true;
			return;
		}
		refreshInFlight = true;
		try {
			const result = await pi.exec("quota-axi", ["--json"], {
				signal: controller.signal,
				timeout: 20_000,
			});
			if (controller.signal.aborted || controller !== sessionController) return;
			quotaReport = result.code === 0 ? parseQuotaReport(result.stdout) : undefined;
			requestRender();
		} catch {
			if (!controller.signal.aborted && controller === sessionController) {
				quotaReport = undefined;
				requestRender();
			}
		} finally {
			refreshInFlight = false;
			if (refreshQueued && !controller.signal.aborted && controller === sessionController) {
				refreshQueued = false;
				void refreshQuota(ctx);
			} else if (controller === sessionController) {
				refreshQueued = false;
			}
		}
	};

	pi.on("session_start", (_event, ctx) => {
		sessionController?.abort();
		sessionController = new AbortController();
		quotaReport = undefined;
		refreshInFlight = false;
		refreshQueued = false;
		requestStartedAt = undefined;
		firstOutputAt = undefined;
		inferenceSpeed = undefined;

		if (ctx.mode !== "tui") return;

		ctx.ui.setFooter((tui, theme, footerData) => {
			const footerRequestRender = () => tui.requestRender();
			activeRequestRender = footerRequestRender;
			return {
				dispose() {
					if (activeRequestRender === footerRequestRender) activeRequestRender = undefined;
				},
				invalidate() {},
				render(width: number): string[] {
					const model = ctx.model;
					const usage = ctx.getContextUsage();
					const context: ContextSnapshot | undefined = usage
						? {
								tokens: usage.tokens,
								contextWindow: usage.contextWindow,
								percent: usage.percent,
							}
						: undefined;
					const statuses = [...footerData.getExtensionStatuses().values()].filter(Boolean);
					return [
							formatFooterLine(
								{
									modelId: model?.id,
									thinkingLevel: pi.getThinkingLevel(),
									context,
									quota: selectQuota(quotaReport, model),
									speed: inferenceSpeed,
								},
								theme,
								width,
							),
							...(statuses.length ? [truncateToWidth(statuses.join(" │ "), Math.max(0, width), "")] : []),
					];
				},
			};
		});
		void refreshQuota(ctx);
	});

	pi.on("session_shutdown", (_event, ctx) => {
		sessionController?.abort();
		sessionController = undefined;
		quotaReport = undefined;
		refreshInFlight = false;
		refreshQueued = false;
		requestStartedAt = undefined;
		firstOutputAt = undefined;
		inferenceSpeed = undefined;
		activeRequestRender = undefined;
		if (ctx.mode === "tui") ctx.ui.setFooter(undefined);
	});

	pi.on("before_provider_request", () => {
		requestStartedAt = performance.now();
		firstOutputAt = undefined;
	});
	pi.on("message_update", (event) => {
		if (requestStartedAt === undefined || firstOutputAt !== undefined) return;
		const type = event.assistantMessageEvent.type;
		if (
			type === "text_start" ||
			type === "text_delta" ||
			type === "thinking_start" ||
			type === "thinking_delta" ||
			type === "toolcall_start" ||
			type === "toolcall_delta"
		) {
			firstOutputAt = performance.now();
		}
	});
	pi.on("message_end", (event) => {
		if (
			event.message.role === "assistant" &&
			requestStartedAt !== undefined &&
			firstOutputAt !== undefined
		) {
			inferenceSpeed = calculateInferenceSpeed(
				{ requestStartedAt, firstOutputAt, completedAt: performance.now() },
				event.message.usage,
			) ?? inferenceSpeed;
			requestStartedAt = undefined;
			firstOutputAt = undefined;
		}
		requestRender();
	});
	pi.on("model_select", () => {
		requestStartedAt = undefined;
		firstOutputAt = undefined;
		inferenceSpeed = undefined;
		requestRender();
	});
	pi.on("thinking_level_select", () => requestRender());
	pi.on("agent_settled", (event, ctx) => {
		void event;
		requestRender();
		if (ctx.mode === "tui") void refreshQuota(ctx);
	});
}
