// The launch log: every agent the hub started, kept in a JSON file so the
// page still lists them after a refresh or a server restart.

import fs from "node:fs";
import path from "node:path";

import type { BackendName } from "./backend.mts";

export interface LaunchRecord {
  id: string;
  at: string;
  backend: BackendName;
  message: string;
  mode: string;
  domain: string | null;
  repo: string;
  name: string;
  model: string | null;
  effort: string | null;
  worktreeId: string | null;
  worktreePath: string | null;
}

export interface LaunchLog {
  file: string;
  list(): LaunchRecord[];
  add(record: Omit<LaunchRecord, "id" | "at">): LaunchRecord;
  get(id: string): LaunchRecord | undefined;
}

export const MAX_RECORDS = 200;

export function launchLogPath(env: NodeJS.ProcessEnv): string {
  const state = env.XDG_STATE_HOME || path.join(env.HOME ?? "", ".local", "state");
  return path.join(state, "lif-hub", "launches.json");
}

export function openLaunchLog(file: string): LaunchLog {
  const read = (): LaunchRecord[] => {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as LaunchRecord[];
    } catch {
      return [];
    }
  };
  return {
    file,
    list: () => read(),
    get: (id) => read().find((r) => r.id === id),
    add(record) {
      const full: LaunchRecord = { id: crypto.randomUUID(), at: new Date().toISOString(), ...record };
      const all = [full, ...read()].slice(0, MAX_RECORDS);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(all, null, 2) + "\n");
      return full;
    },
  };
}
