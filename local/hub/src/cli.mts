// lif-hub: classify one message, assemble the starter prompt, launch a
// worktree with the agent already working on it. Orca or Herdr owns the
// worktree: LIF_HUB_BACKEND / --backend picks, else Herdr inside a Herdr pane.
//
//   lif-hub "message"                 classify + launch
//   lif-hub --b64 <base64-message>    same, message shell-safe (the Orca side panel uses this)
//   lif-hub --mode exec --repo lif-studio --domain coding "message"   skip/override the classifier
//   lif-hub --dry-run ...             print what would run, launch nothing
//   lif-hub --list                    print modes, domains, repos
//   lif-hub serve [--port N]          run the hub page server in the foreground
//   lif-hub open [--port N]           start the server if needed and open the page (Orca tab or browser)
//   lif-hub --backend orca|herdr ...  choose which tool owns the worktree

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createHub } from "./hub.mts";
import type { Hub } from "./hub.mts";
import { DEFAULT_PORT, isServerUp, startServer } from "./server.mts";

interface Args {
  command: "route" | "list" | "serve" | "open";
  message: string;
  mode?: string;
  domain?: string;
  repo?: string;
  dryRun: boolean;
  noActivate: boolean;
  port: number;
  backend?: string;
}

export function parseArgs(argv: readonly string[]): Args {
  const out: Args = { command: "route", message: "", dryRun: false, noActivate: false, port: DEFAULT_PORT };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (i === 0 && (a === "serve" || a === "open" || a === "list")) out.command = a;
    else if (a === "--mode") out.mode = next();
    else if (a === "--domain") out.domain = next();
    else if (a === "--repo") out.repo = next();
    else if (a === "--port") out.port = Number(next());
    else if (a === "--backend") out.backend = next();
    else if (a === "--b64") out.message = Buffer.from(next(), "base64").toString("utf8");
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--list" || a === "-h" || a === "--help") out.command = "list";
    else if (a === "--no-activate") out.noActivate = true;
    else rest.push(a);
  }
  if (!out.message) out.message = rest.join(" ");
  if (!Number.isInteger(out.port) || out.port <= 0) throw new Error("--port must be a positive integer");
  return out;
}

function printList(hub: Hub): void {
  console.log("modes:");
  for (const [k, m] of Object.entries(hub.profiles.modes)) {
    console.log(`  ${k.padEnd(8)} ${m.describe}`);
    for (const [d, v] of Object.entries(m.domains)) console.log(`    --domain ${d.padEnd(10)} ${v.describe}`);
  }
  console.log("repos:");
  for (const r of hub.repos()) console.log(`  ${r.displayName.padEnd(22)} ${r.path}`);
  console.log(`\nbackend: ${hub.backend.name} (${hub.backend.executable})`);
  console.log("lif-hub serve | open   run the hub page / open it in Orca or the browser");
}

async function openHubTab(hub: Hub, port: number, env: NodeJS.ProcessEnv): Promise<number> {
  const url = `http://127.0.0.1:${port}/`;
  if (!(await isServerUp(port))) {
    const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), "serve", "--port", String(port)], {
      detached: true,
      stdio: "ignore",
      env,
    });
    child.unref();
    for (let i = 0; i < 40 && !(await isServerUp(port)); i++) await new Promise((r) => setTimeout(r, 100));
    if (!(await isServerUp(port))) throw new Error(`hub server did not come up on ${url}`);
  }
  hub.backend.openPage(url, env);
  console.log(`hub open at ${url}`);
  return 0;
}

export async function main(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const args = parseArgs(argv);
  const hub = createHub(env, args.backend);

  if (args.command === "list") {
    printList(hub);
    return 0;
  }
  if (args.command === "serve") {
    const server = startServer(hub, args.port);
    await new Promise<void>((resolve) => server.on("close", resolve));
    return 0;
  }
  if (args.command === "open") return openHubTab(hub, args.port, env);

  if (!args.message.trim()) {
    console.error("lif-hub: give me a message (or --list)");
    return 2;
  }
  const routed = hub.route(args.message, { mode: args.mode, domain: args.domain, repo: args.repo }, !args.noActivate);
  const { classification, prompt, spec } = routed;
  console.log(
    `lif-hub: ${classification.mode}${classification.domain ? `/${classification.domain}` : ""} -> ${classification.repo} (${spec.name})`,
  );
  if (args.dryRun) {
    const shown = hub.backend.preview(spec).map((argv) => `$ ${argv.map((a) => (a === prompt ? "<prompt>" : a)).join(" ")}`);
    console.log(`\n${shown.join("\n")}\n\n${prompt}`);
    return 0;
  }
  const launched = hub.launch(spec, args.message, classification);
  console.log(`launched ${spec.agent} in ${launched.worktreePath ?? "(new worktree)"}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(`lif-hub: ${(error as Error).message}`);
      process.exit(1);
    },
  );
}
