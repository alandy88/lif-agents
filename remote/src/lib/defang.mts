// Prompt-injection defence for template argument substitution.

/**
 * Neutralize `` !`…` `` shell-expansion blocks by inserting a space after the
 * bang. Prompt preprocessing runs `{{ARG}}` substitution BEFORE it expands
 * `` !`shell` ``, so any substituted value lands in the template early enough to
 * be executed by a template that uses expansion (review-prompt.md does).
 *
 * The reachable sources are all untrusted to some degree: an issue body or title
 * can be written by anyone who can file an issue on the repo, and the notes and
 * checklist are agent-authored. The rendered text is unchanged for every input
 * that is not an expansion block.
 */
export function defangShellExpansion(text: string): string {
  return text.replace(/!`/g, "! `");
}

/**
 * Defang every value in a prompt-args map at the point of use, so a template
 * that gains a shell expression later cannot silently reopen the hole and no
 * individual call site has to remember the rule.
 */
export function defangPromptArgs<T extends Record<string, string>>(args: T): T {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [key, defangShellExpansion(value)]),
  ) as T;
}
