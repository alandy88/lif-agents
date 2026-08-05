// Typed wrapper over the `herdr` CLI (PRD §5.2).
//
// Two rules drive the shape of this file:
//  - Every invocation pins the session explicitly (env var AND flag). Firstmate
//    verified that the env var alone silently routes to the wrong server when a
//    second Herdr is bound on the machine.
//  - Placement comes from live socket identity, never from a label. Herdr does
//    not enforce label uniqueness, so an ambiguous label is a refusal, not a pick.
//
// Response shapes below are narrowed to the fields consumed here; every function
// returns a `raw` escape hatch for callers that need more.

import { execFile } from "node:child_process";

const DISPATCH_LABEL = "lif-dispatch";

/** `pane read --lines N` returns empty when N is below the viewport height. */
const PANE_READ_FLOOR = 200;

export interface HerdrExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export type HerdrExec = (
  args: string[],
  env?: NodeJS.ProcessEnv,
) => Promise<HerdrExecResult>;

export interface HerdrCtx {
  /** Named session, or "default". */
  session: string;
  /** Injected for tests; defaults to the real CLI. */
  exec?: HerdrExec;
  /** Identity source and child-process env base. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
}

export class HerdrError extends Error {
  readonly exitCode: number;
  readonly errorCode: string | undefined;
  readonly stderr: string;
  readonly raw: unknown;

  constructor(init: {
    message: string;
    exitCode: number;
    errorCode?: string | undefined;
    stderr: string;
    raw: unknown;
  }) {
    super(init.message);
    this.name = "HerdrError";
    this.exitCode = init.exitCode;
    this.errorCode = init.errorCode;
    this.stderr = init.stderr;
    this.raw = init.raw;
  }
}

export const defaultExec: HerdrExec = (args, env) =>
  new Promise((resolve) => {
    // execFile, never a shell: arguments carry Windows paths with spaces and
    // backslashes, and the tool must behave identically on macOS and WSL.
    execFile("herdr", args, { env, encoding: "utf8" }, (error, stdout, stderr) => {
      const code =
        error && typeof (error as { code?: unknown }).code === "number"
          ? (error as { code: number }).code
          : error
            ? 1
            : 0;
      resolve({ stdout, stderr, code });
    });
  });

// The usage line documents `--session` as a leading global flag; the PRD says
// trailing. Leading is used here and centralized in this one function so a live
// verification can flip it in a single place. NEEDS one empirical check.
function withSession(session: string, args: string[]): string[] {
  return ["--session", session, ...args];
}

function envFor(ctx: HerdrCtx): NodeJS.ProcessEnv {
  return { ...(ctx.env ?? process.env), HERDR_SESSION: ctx.session };
}

interface HerdrErrorBody {
  code?: string;
  message?: string;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function errorBody(payload: unknown): HerdrErrorBody | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const err = (payload as { error?: unknown }).error;
  if (typeof err !== "object" || err === null) return undefined;
  return err as HerdrErrorBody;
}

async function herdrRun(ctx: HerdrCtx, args: string[]): Promise<HerdrExecResult> {
  const exec = ctx.exec ?? defaultExec;
  const full = withSession(ctx.session, args);
  const result = await exec(full, envFor(ctx));
  if (result.code !== 0) {
    // Server errors are JSON on stderr; CLI syntax errors (exit 2) are plain text.
    const payload = parseJson(result.stderr) ?? parseJson(result.stdout);
    const body = errorBody(payload);
    const detail = body?.message ?? result.stderr.trim();
    throw new HerdrError({
      message: `herdr ${args.join(" ")} failed (exit ${result.code})${detail ? `: ${detail}` : ""}`,
      exitCode: result.code,
      errorCode: body?.code,
      stderr: result.stderr,
      raw: payload,
    });
  }
  return result;
}

/** Runs a control command and returns its `result` payload. */
async function herdrJson(ctx: HerdrCtx, args: string[]): Promise<Record<string, unknown>> {
  const { stdout } = await herdrRun(ctx, args);
  const payload = parseJson(stdout);
  const result =
    typeof payload === "object" && payload !== null
      ? (payload as { result?: unknown }).result
      : undefined;
  if (typeof result !== "object" || result === null) {
    throw new HerdrError({
      message: `herdr ${args.join(" ")} returned unparseable output`,
      exitCode: 0,
      stderr: "",
      raw: stdout,
    });
  }
  return result as Record<string, unknown>;
}

export interface WorkspaceInfo {
  workspace_id: string;
  label?: string;
  active_tab_id?: string;
}

export interface TabInfo {
  tab_id: string;
  workspace_id: string;
  label?: string;
}

export interface PaneInfo {
  pane_id: string;
  tab_id: string;
  workspace_id: string;
  cwd?: string;
}

/** Creation responses may carry either a bare id string or the full record. */
function idOf(value: unknown, key: string): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const inner = (value as Record<string, unknown>)[key];
    if (typeof inner === "string") return inner;
  }
  return undefined;
}

function requireId(value: unknown, key: string, what: string): string {
  const id = idOf(value, key);
  if (!id) throw new HerdrError({
    message: `herdr response did not carry a ${what} id`,
    exitCode: 0,
    stderr: "",
    raw: value,
  });
  return id;
}

export interface WorkspaceResolution {
  workspaceId: string;
  /** "identity" = resolved from live socket identity; "label" = outside Herdr. */
  source: "identity" | "label";
  raw: unknown;
}

/**
 * Resolves the workspace the task tab belongs in (PRD §5.2). Refuses rather than
 * guessing: inside Herdr the injected identity is authority and must verify live;
 * outside, exactly one `lif-dispatch` workspace must exist or be creatable.
 */
export async function workspaceResolve(ctx: HerdrCtx): Promise<WorkspaceResolution> {
  const env = ctx.env ?? process.env;
  if (env["HERDR_ENV"] === "1") {
    return resolveFromIdentity(ctx, env);
  }
  return resolveFromLabel(ctx);
}

async function resolveFromIdentity(
  ctx: HerdrCtx,
  env: NodeJS.ProcessEnv,
): Promise<WorkspaceResolution> {
  const workspaceId = env["HERDR_WORKSPACE_ID"];
  const tabId = env["HERDR_TAB_ID"];
  const paneId = env["HERDR_PANE_ID"];
  if (!workspaceId || !tabId || !paneId) {
    throw new Error(
      "refusing to dispatch: HERDR_ENV=1 but socket identity is incomplete " +
        `(workspace=${workspaceId ?? "?"} tab=${tabId ?? "?"} pane=${paneId ?? "?"})`,
    );
  }

  let workspace: WorkspaceInfo;
  try {
    const result = await herdrJson(ctx, ["workspace", "get", workspaceId]);
    workspace = result["workspace"] as WorkspaceInfo;
  } catch (cause) {
    throw new Error(
      `refusing to dispatch: injected workspace ${workspaceId} could not be read live ` +
        `(${cause instanceof Error ? cause.message : String(cause)})`,
    );
  }
  if (workspace?.workspace_id !== workspaceId) {
    throw new Error(
      `refusing to dispatch: workspace get ${workspaceId} returned ${workspace?.workspace_id ?? "nothing"}`,
    );
  }

  const tab = (await herdrJson(ctx, ["tab", "get", tabId]))["tab"] as TabInfo | undefined;
  if (tab?.workspace_id !== workspaceId) {
    throw new Error(
      `refusing to dispatch: injected tab ${tabId} belongs to workspace ` +
        `${tab?.workspace_id ?? "nothing"}, not ${workspaceId}`,
    );
  }

  const pane = (await herdrJson(ctx, ["pane", "get", paneId]))["pane"] as PaneInfo | undefined;
  if (pane?.workspace_id !== workspaceId) {
    throw new Error(
      `refusing to dispatch: injected pane ${paneId} belongs to workspace ` +
        `${pane?.workspace_id ?? "nothing"}, not ${workspaceId}`,
    );
  }

  return { workspaceId, source: "identity", raw: workspace };
}

async function resolveFromLabel(ctx: HerdrCtx): Promise<WorkspaceResolution> {
  const result = await herdrJson(ctx, ["workspace", "list"]);
  const workspaces = (result["workspaces"] ?? []) as WorkspaceInfo[];
  const matches = workspaces.filter((w) => w?.label === DISPATCH_LABEL);

  if (matches.length > 1) {
    throw new Error(
      `refusing to dispatch: ${matches.length} workspaces are labeled "${DISPATCH_LABEL}" ` +
        `(${matches.map((w) => w.workspace_id).join(", ")}) — placement is ambiguous`,
    );
  }

  const existing = matches[0];
  if (existing) {
    return { workspaceId: existing.workspace_id, source: "label", raw: existing };
  }

  const created = await herdrJson(ctx, [
    "workspace",
    "create",
    "--label",
    DISPATCH_LABEL,
    "--no-focus",
  ]);
  return {
    workspaceId: requireId(created["workspace"], "workspace_id", "workspace"),
    source: "label",
    raw: created,
  };
}

export interface TabEndpoint {
  tabId: string;
  paneId: string;
  raw: unknown;
}

export async function tabCreate(
  ctx: HerdrCtx,
  opts: { workspaceId: string; cwd?: string; label?: string },
): Promise<TabEndpoint> {
  const args = ["tab", "create", "--workspace", opts.workspaceId];
  if (opts.cwd) args.push("--cwd", opts.cwd);
  if (opts.label) args.push("--label", opts.label);
  args.push("--no-focus");

  const result = await herdrJson(ctx, args);
  return {
    tabId: requireId(result["tab"], "tab_id", "tab"),
    paneId: requireId(result["root_pane"], "pane_id", "pane"),
    raw: result,
  };
}

export async function agentStart(
  ctx: HerdrCtx,
  opts: {
    paneId: string;
    name: string;
    kind: string;
    args?: string[];
    timeoutMs?: number;
  },
): Promise<Record<string, unknown>> {
  const args = ["agent", "start", opts.name, "--kind", opts.kind, "--pane", opts.paneId];
  if (opts.timeoutMs !== undefined) args.push("--timeout", String(opts.timeoutMs));
  if (opts.args?.length) args.push("--", ...opts.args);
  return herdrJson(ctx, args);
}

export type AgentState = "idle" | "working" | "blocked" | "done" | "unknown";

const AGENT_STATES: readonly AgentState[] = ["idle", "working", "blocked", "done", "unknown"];

export interface AgentStatus {
  state: AgentState;
  paneId: string | undefined;
  raw: unknown;
}

/**
 * Note for callers (PRD §5.6 step 1): `working` is trustworthy evidence of
 * activity, `idle` is not proof of completion — it reads idle while the agent
 * blocks on a long-running foreground tool call.
 */
export async function agentGet(ctx: HerdrCtx, target: string): Promise<AgentStatus> {
  const result = await herdrJson(ctx, ["agent", "get", target]);
  const agent = result["agent"] as
    | { agent_status?: string; pane_id?: string }
    | undefined;
  const status = agent?.agent_status;
  const state = AGENT_STATES.find((s) => s === status) ?? "unknown";
  return { state, paneId: agent?.pane_id, raw: result };
}

/** Returns plain text — `pane read` is the one command that is not JSON. */
export async function paneRead(
  ctx: HerdrCtx,
  paneId: string,
  lines: number,
  source: "visible" | "recent" | "recent-unwrapped" = "recent",
): Promise<string> {
  const requested = Math.max(lines, PANE_READ_FLOOR);
  const { stdout } = await herdrRun(ctx, [
    "pane",
    "read",
    paneId,
    "--source",
    source,
    "--lines",
    String(requested),
    "--format",
    "text",
  ]);
  const all = stdout.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  return all.slice(Math.max(0, all.length - lines)).join("\n");
}

export async function tabClose(ctx: HerdrCtx, tabId: string): Promise<void> {
  await herdrJson(ctx, ["tab", "close", tabId]);
}
