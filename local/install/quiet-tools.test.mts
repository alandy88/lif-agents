import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Like the footer tests, Pi is supplied by the runtime, not a kit dependency.
const names = ["Read", "Bash", "PowerShell", "Edit", "Write", "Grep", "Find", "Ls"];
const definitions = new Map<string, any>();
const settings = { getImageAutoResize: () => false, getShellCommandPrefix: () => "prefix", getShellPath: () => "/shell" };
const runtime: Record<string, any> = { SettingsManager: { create: () => settings } };
for (const name of names) {
  runtime[`create${name}ToolDefinition`] = (cwd: string, options: unknown) => {
    const tool = {
      name: name.toLowerCase(), label: name, parameters: {}, promptGuidelines: ["original"], cwd, options,
      execute: async (...args: unknown[]) => args,
      renderCall: (_args: unknown, _theme: unknown, ctx: any) => {
        assert.equal(ctx.lastComponent, undefined);
        return { render: () => ["call"], invalidate() {} };
      },
      renderResult: (_result: unknown, _options: unknown, _theme: unknown, ctx: any) => {
        assert.equal(ctx.lastComponent, undefined);
        return { render: () => ["result"], invalidate() {} };
      },
    };
    definitions.set(tool.name, tool);
    return tool;
  };
}
(globalThis as any).__quietRuntime = runtime;
const root = mkdtempSync(join(tmpdir(), "quiet-tools-test-"));
const path = join(root, "extension.ts");
const source = readFileSync(new URL("../pi/extensions/quiet-tools.ts", import.meta.url), "utf8");
writeFileSync(path, source.replace(/import \{[\s\S]*?\} from "@earendil-works\/pi-coding-agent";/,
  `const { ${Object.keys(runtime).join(", ")} } = globalThis.__quietRuntime;`));
let extension: any;
try { extension = await import(pathToFileURL(path).href); }
finally { rmSync(root, { recursive: true, force: true }); }

function harness(mode = "tui", entries: any[] = []) {
  const handlers: Record<string, Function> = {};
  const commands: Record<string, any> = {};
  const tools = new Map<string, any>();
  const statuses = new Map<string, string>();
  const notifications: string[] = [];
  const active = ["read", "bash", "edit", "custom"];
  const pi = {
    on: (name: string, handler: Function) => { handlers[name] = handler; },
    registerCommand: (name: string, command: any) => { commands[name] = command; },
    registerTool: (tool: any) => { tools.set(tool.name, tool); },
    getAllTools: () => [...names.map(name => ({ name: name.toLowerCase(), sourceInfo: { source: name === "Edit" ? "extension" : "builtin" } }))],
    getActiveTools: () => active,
    setActiveTools: (value: string[]) => assert.deepEqual(value, active),
    appendEntry: (customType: string, data: unknown) => entries.push({ type: "custom", customType, data }),
  };
  const ctx = {
    mode, cwd: "/workspace", isProjectTrusted: () => false,
    sessionManager: { getBranch: () => entries },
    ui: { setStatus: (key: string, value: string) => statuses.set(key, value), notify: (text: string) => notifications.push(text), theme: { fg: (_: string, text: string) => text } },
  };
  extension.default(pi);
  handlers.session_start!({}, ctx);
  return { handlers, commands, tools, ctx, statuses, entries, notifications };
}

test("wraps only built-ins, preserves execution, metadata, settings and active tools", async () => {
  const h = harness();
  assert.equal(h.tools.has("edit"), false);
  assert.equal(h.tools.has("custom"), false);
  assert.match(h.notifications[0]!, /Unmodified tools: edit, custom/);
  const read = h.tools.get("read");
  assert.equal(read.execute, definitions.get("read").execute);
  assert.equal(read.parameters, definitions.get("read").parameters);
  assert.equal(read.promptGuidelines, definitions.get("read").promptGuidelines);
  assert.deepEqual(definitions.get("bash").options, { shellPath: "/shell", commandPrefix: "prefix" });
  const signal = new AbortController().signal;
  const update = () => {};
  assert.deepEqual(await read.execute("id", {}, signal, update, h.ctx), ["id", {}, signal, update, h.ctx]);
});

test("hides both slots across streaming/errors/expansion, then reveals and re-hides old rows", async () => {
  const h = harness();
  const tool = h.tools.get("read");
  let invalidated = 0;
  const ctx = { toolCallId: "id", invalidate: () => invalidated++, isPartial: true, expanded: true, isError: true };
  assert.equal(tool.renderShell, "self");
  const hidden = tool.renderCall({}, {}, ctx);
  assert.deepEqual(hidden.render(80), []);
  assert.deepEqual(tool.renderResult({}, {}, {}, ctx).render(80), []);
  await h.commands["quiet-tools"].handler("off", h.ctx);
  assert.equal(invalidated, 1);
  assert.deepEqual(tool.renderCall({}, {}, { ...ctx, lastComponent: hidden }).render(80), ["call"]);
  assert.deepEqual(tool.renderResult({}, {}, {}, { ...ctx, lastComponent: hidden }).render(80), ["result"]);
  await h.commands["quiet-tools"].handler("on", h.ctx);
  assert.deepEqual(tool.renderCall({}, {}, ctx).render(80), []);
  h.handlers.session_shutdown!({}, h.ctx);
  const count = invalidated;
  await h.commands["quiet-tools"].handler("off", h.ctx);
  assert.equal(invalidated, count);
});

test("restores branch preference and reports failures only through status", async () => {
  const h = harness("tui", [{ type: "custom", customType: "lif-quiet-tools", data: { quiet: false } }]);
  const context = { toolCallId: "id", invalidate() {} };
  assert.deepEqual(h.tools.get("read").renderCall({}, {}, context).render(80), ["call"]);
  await h.commands["quiet-tools"].handler("on", h.ctx);
  h.handlers.tool_execution_end!({ toolName: "read", isError: true }, h.ctx);
  assert.match(h.statuses.get("lif-quiet-tools")!, /1 failed/);
  h.handlers.agent_start!({}, h.ctx);
  assert.equal(h.statuses.get("lif-quiet-tools"), undefined);
  h.entries.splice(1);
  h.handlers.session_tree!({}, h.ctx);
  assert.deepEqual(h.tools.get("read").renderCall({}, {}, context).render(80), ["call"]);
});

for (const mode of ["rpc", "json", "print"]) {
  test(`does not override tools in ${mode} mode`, () => assert.equal(harness(mode).tools.size, 0));
}
