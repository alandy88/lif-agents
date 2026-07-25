// Pure helpers for the checklist-in-issue-body task model.
//
// The issue body's markdown task-list IS the plan: top-to-bottom = build order,
// `- [x]` = done. Progress has two surfaces with distinct roles:
//   • `Task-Done: <i>` git trailers on the branch — the durable machine state
//     the loop resumes from (the branch is the checkpoint).
//   • the checked boxes on the issue — the human-facing display, updated by the
//     host after each green task (best-effort; a missed update only costs a
//     redundant-looking box, never a re-run).
//
// Pure (no fs / network / spawn) so every decision here is unit-testable.

/** One checklist item, in body order. */
export type TaskItem = { text: string; checked: boolean };

// Anchored per-line: optional indent, a `-`/`*`/`+` bullet, a `[ ]`/`[x]`
// checkbox, then the task text. `m` makes `^`/`$` match each line.
const TASK_LINE = /^[ \t]*[-*+][ \t]+\[([ xX])\][ \t]+(.+?)[ \t]*$/gm;

/**
 * Parse the ordered task-list out of an issue body. Only task-list lines count
 * — prose, bare bullets, and code never sneak into the plan. Order is
 * top-to-bottom body order (the author-controlled list IS the order; no
 * dependency graph).
 */
export function parseTaskList(body: string): TaskItem[] {
  const tasks: TaskItem[] = [];
  for (const match of body.matchAll(TASK_LINE)) {
    tasks.push({ text: match[2]!, checked: match[1] !== " " });
  }
  return tasks;
}

/**
 * Return `body` with the `index`-th (1-based, task-list order) checkbox
 * checked. Out-of-range indices return the body unchanged — check-off is a
 * display update and must never throw mid-loop.
 */
export function checkOffTask(body: string, index: number): string {
  let seen = 0;
  return body.replace(TASK_LINE, (line, box: string) => {
    seen += 1;
    if (seen !== index || box !== " ") return line;
    return line.replace("[ ]", "[x]");
  });
}

/** The trailer recorded on the branch for a completed task. */
export function taskDoneTrailer(index: number): string {
  return `Task-Done: ${index}`;
}

/**
 * Parse the set of completed task indices out of a `git log` text blob.
 * Anchored to the start of a (possibly indented) line — git indents trailer
 * lines under the default log format — so a stray `Task-Done:` in prose does
 * not match.
 */
export function parseTaskDoneTrailers(logStdout: string): Set<number> {
  const re = /^[ \t]*Task-Done:[ \t]*(\d+)[ \t]*$/gm;
  const done = new Set<number>();
  for (const match of logStdout.matchAll(re)) {
    done.add(Number.parseInt(match[1]!, 10));
  }
  return done;
}

/**
 * Render the checklist for a task prompt: numbered, with done/pending markers
 * reflecting BOTH surfaces (body checkbox or branch trailer), so the agent sees
 * exactly what the loop considers done.
 */
export function renderTaskList(tasks: TaskItem[], done: Set<number>): string {
  return tasks
    .map((task, i) => {
      const index = i + 1;
      const mark = task.checked || done.has(index) ? "x" : " ";
      return `${index}. [${mark}] ${task.text}`;
    })
    .join("\n");
}

/**
 * Remove the canonical `## Tasks` section before embedding the issue body in a
 * task prompt. The separately rendered task list is authoritative and reflects
 * trailer state; retaining the body section would show a stale second copy.
 */
export function stripTaskSection(body: string): string {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s*##\s+Tasks\s*$/i.test(line));
  if (start === -1) return body;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*#{1,2}(?:\s+|$)/.test(lines[i]!)) {
      end = i;
      break;
    }
  }

  return [...lines.slice(0, start), ...lines.slice(end)].join("\n").trimEnd();
}
