// Serves the hub page on loopback and turns its requests into hub calls.
// Loopback plus an Origin check keeps other pages from launching agents.

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Hub, Overrides } from "./hub.mts";

export const DEFAULT_PORT = 47811;
const MAX_BODY_BYTES = 64 * 1024;

const PAGE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "page", "index.html");

export interface HubRequest {
  method: string;
  url: string;
  origin: string | undefined;
  host: string | undefined;
  body: string;
}

export interface HubResponse {
  status: number;
  contentType: string;
  body: string;
}

function json(status: number, value: unknown): HubResponse {
  return { status, contentType: "application/json; charset=utf-8", body: JSON.stringify(value) };
}

function overridesFrom(raw: Record<string, unknown>): Overrides {
  const pick = (k: string): string | undefined => (typeof raw[k] === "string" && raw[k] !== "" ? (raw[k] as string) : undefined);
  return { mode: pick("mode"), domain: pick("domain"), repo: pick("repo") };
}

/** Pure request handler so it can be tested without sockets. */
export function handle(hub: Hub, req: HubRequest, readPage: () => string = () => fs.readFileSync(PAGE_PATH, "utf8")): HubResponse {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && url.pathname === "/") {
    return { status: 200, contentType: "text/html; charset=utf-8", body: readPage() };
  }
  if (req.method === "GET" && url.pathname === "/api/health") return json(200, { ok: true });
  if (req.method === "GET" && url.pathname === "/api/profiles") {
    const modes = Object.fromEntries(
      Object.entries(hub.profiles.modes).map(([k, m]) => [
        k,
        { describe: m.describe, domains: Object.fromEntries(Object.entries(m.domains).map(([d, v]) => [d, v.describe])) },
      ]),
    );
    return json(200, { modes, repos: hub.repos(), defaultRepo: hub.profiles.defaultRepo, agent: hub.profiles.agent });
  }
  if (req.method === "POST") {
    if (req.origin && req.host && new URL(req.origin).host !== req.host) return json(403, { error: "cross-origin request refused" });
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(req.body || "{}") as Record<string, unknown>;
    } catch {
      return json(400, { error: "body must be JSON" });
    }
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return json(400, { error: "message is required" });
    const overrides = overridesFrom(body);
    try {
      if (url.pathname === "/api/route") {
        const r = hub.route(message, overrides);
        return json(200, { classification: r.classification, name: r.spec.name, repoPath: r.spec.repoPath, prompt: r.prompt });
      }
      if (url.pathname === "/api/launch") {
        const r = hub.route(message, overrides);
        const launched = hub.launch(r.spec);
        return json(200, { classification: r.classification, name: r.spec.name, repoPath: r.spec.repoPath, ...launched });
      }
    } catch (error) {
      return json(500, { error: (error as Error).message });
    }
  }
  return json(404, { error: "not found" });
}

export function startServer(hub: Hub, port: number = DEFAULT_PORT): http.Server {
  const server = http.createServer((req, res) => {
    let body = "";
    let tooBig = false;
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
      if (body.length > MAX_BODY_BYTES) tooBig = true;
    });
    req.on("end", () => {
      const out = tooBig
        ? json(413, { error: "body too large" })
        : handle(hub, {
            method: req.method ?? "GET",
            url: req.url ?? "/",
            origin: req.headers.origin,
            host: req.headers.host,
            body,
          });
      res.writeHead(out.status, { "content-type": out.contentType, "cache-control": "no-store" });
      res.end(out.body);
    });
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`lif-hub page: http://127.0.0.1:${port}/`);
  });
  return server;
}

export function isServerUp(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/api/health", timeout: 500 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}
