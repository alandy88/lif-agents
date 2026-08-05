// Durable dispatch-time facts: ~/.config/lif-dispatch/{tasks,projects}.json.
// Every function takes an optional config dir so tests (and alternate machines)
// can point elsewhere; nothing here shells out, so it works the same on
// Windows, macOS and WSL.

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { DispatchTask, ProjectEntry, ProjectsConfig } from "./types.mts";

export interface TaskStore {
  tasks: DispatchTask[];
}

const TASKS_FILE = "tasks.json";
const PROJECTS_FILE = "projects.json";
const EXAMPLE_HINT = "local/dispatch/projects.example.json";

export function configDir(): string {
  return path.join(os.homedir(), ".config", "lif-dispatch");
}

function tasksPath(dir: string): string {
  return path.join(dir, TASKS_FILE);
}

export function projectsPath(dir: string = configDir()): string {
  return path.join(dir, PROJECTS_FILE);
}

/** Temp-file-plus-rename in the same directory: rename is atomic there, so a
 *  dispatch and a collect running from two shells can never tear the file. */
function writeAtomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, file);
}

export function loadTasks(dir: string = configDir()): TaskStore {
  const file = tasksPath(dir);
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { tasks: [] };
    throw error;
  }
  // A corrupt store must never read as empty: that would silently erase live
  // task records on the next write.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Corrupt task store at ${file}: ${(error as Error).message}. Fix or move the file by hand.`,
    );
  }
  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as TaskStore).tasks)) {
    throw new Error(`Corrupt task store at ${file}: expected { "tasks": [...] }.`);
  }
  return { tasks: (parsed as TaskStore).tasks };
}

export function saveTasks(store: TaskStore, dir: string = configDir()): void {
  writeAtomic(tasksPath(dir), `${JSON.stringify(store, null, 2)}\n`);
}

export function addTask(task: DispatchTask, dir: string = configDir()): void {
  const store = loadTasks(dir);
  if (store.tasks.some((t) => t.id === task.id)) {
    throw new Error(`Task ${task.id} already exists in ${tasksPath(dir)}.`);
  }
  store.tasks.push(task);
  saveTasks(store, dir);
}

export function getTask(id: string, dir: string = configDir()): DispatchTask {
  const store = loadTasks(dir);
  const task = store.tasks.find((t) => t.id === id);
  if (!task) {
    const known = store.tasks.map((t) => t.id).join(", ") || "(none)";
    throw new Error(`Unknown task ${id}. Known tasks: ${known}`);
  }
  return task;
}

export function updateTask(
  id: string,
  patch: Partial<DispatchTask>,
  dir: string = configDir(),
): DispatchTask {
  const store = loadTasks(dir);
  const index = store.tasks.findIndex((t) => t.id === id);
  const current = store.tasks[index];
  if (!current) {
    const known = store.tasks.map((t) => t.id).join(", ") || "(none)";
    throw new Error(`Unknown task ${id}. Known tasks: ${known}`);
  }
  const updated: DispatchTask = { ...current, ...patch, id: current.id };
  store.tasks[index] = updated;
  saveTasks(store, dir);
  return updated;
}

export function openTasks(dir: string = configDir()): DispatchTask[] {
  return loadTasks(dir).tasks.filter((t) => t.state === "dispatched");
}

export function loadProjects(dir: string = configDir()): ProjectsConfig {
  const file = projectsPath(dir);
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `No project config at ${file}. Copy ${EXAMPLE_HINT} there and edit the paths.`,
      );
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Corrupt project config at ${file}: ${(error as Error).message}`);
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as ProjectsConfig).projects !== "object" ||
    (parsed as ProjectsConfig).projects === null
  ) {
    throw new Error(
      `Invalid project config at ${file}: expected a "projects" object. See ${EXAMPLE_HINT}.`,
    );
  }
  return parsed as ProjectsConfig;
}

/** Resolves a project name to an entry with defaults applied. */
export function resolveProject(config: ProjectsConfig, name: string): ProjectEntry {
  const entry = config.projects[name];
  if (!entry) {
    const known = Object.keys(config.projects).join(", ") || "(none)";
    throw new Error(`Unknown project ${name}. Known projects: ${known}`);
  }
  if (!entry.path) {
    throw new Error(`Project ${name} has no "path".`);
  }
  if (!path.isAbsolute(entry.path)) {
    throw new Error(`Project ${name} path must be absolute, got ${entry.path}.`);
  }
  return { ...entry, baseBranch: entry.baseBranch ?? "main" };
}

export function newTaskId(project: string, slugSource: string): string {
  const slug =
    slugSource
      .toLowerCase()
      .split(/\s+/)
      .slice(0, 5)
      .join("-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .slice(0, 24)
      .replace(/^-|-$/g, "") || "task";
  return `${project}-${slug}-${randomBytes(2).toString("hex")}`;
}
