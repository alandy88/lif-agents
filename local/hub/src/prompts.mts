// Reads the starter-prompt collection (a Markdown file of `## heading` +
// ```text block pairs) and assembles BASE + MODE + DOMAIN into one prompt.

export interface PromptSections {
  /** slug(heading) -> text-block body */
  readonly sections: ReadonlyMap<string, string>;
}

/** "MODE — Idea exploration (general)" -> "mode-idea-exploration-general" */
export function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parsePromptSections(markdown: string): PromptSections {
  const sections = new Map<string, string>();
  const lines = markdown.split(/\r?\n/);
  let heading: string | null = null;
  let inBlock = false;
  let block: string[] = [];
  for (const line of lines) {
    if (!inBlock && line.startsWith("## ")) {
      heading = slugify(line.slice(3));
      continue;
    }
    if (line.startsWith("```")) {
      if (!inBlock) {
        inBlock = line.trim() === "```text" && heading !== null && !sections.has(heading);
        block = [];
      } else {
        inBlock = false;
        if (heading && !sections.has(heading) && block.length > 0) {
          sections.set(heading, block.join("\n").trim());
        }
      }
      continue;
    }
    if (inBlock) block.push(line);
  }
  return { sections };
}

export interface AssembleInput {
  sections: PromptSections;
  baseSection: string;
  modeSection: string;
  domainSection?: string;
  task: string;
}

export function assemblePrompt(input: AssembleInput): string {
  const pick = (slug: string): string => {
    const text = input.sections.sections.get(slug);
    if (!text) {
      const known = [...input.sections.sections.keys()].join(", ");
      throw new Error(`starter prompt section "${slug}" not found. Known: ${known}`);
    }
    return text;
  };
  const parts = [pick(input.baseSection), pick(input.modeSection)];
  if (input.domainSection) parts.push(pick(input.domainSection));
  parts.push(`# Task\n\n${input.task.trim()}`);
  return parts.join("\n\n---\n\n");
}
