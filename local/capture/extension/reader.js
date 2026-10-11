// Injected after vendor/Readability.js. A classic script: the value of this one
// expression is the capture the background script receives, once its promise
// settles. It declares nothing at the top level, so injecting it into the same
// tab twice is safe.

(async () => {
  const page = {
    site: location.hostname,
    url: location.href,
    captured: new Date().toISOString(),
  };

  const selection = String(getSelection());
  if (selection.trim()) return { ...page, title: document.title, body: selection };

  // Same-origin, so the request carries the tab's own Reddit session.
  const reddit = async () => {
    const response = await fetch(`${location.origin}${location.pathname.replace(/\/$/, "")}.json?raw_json=1`);
    if (!response.ok) throw new Error(`Reddit answered ${response.status}`);
    const [posts, replies] = await response.json();
    const post = posts.data.children[0].data;

    const comments = [];
    const walk = (listing, parent) => {
      // The other kind is "more": a stub for comments Reddit did not send.
      for (const { kind, data } of listing?.data?.children ?? []) {
        if (kind !== "t1") continue;
        comments.push(`**u/${data.author}**${parent ? ` (reply to u/${parent})` : ""}`, data.body);
        walk(data.replies, data.author);
      }
    };
    walk(replies);

    return {
      title: post.title,
      blocks: [
        `# ${post.title}`,
        `u/${post.author} in ${post.subreddit_name_prefixed}`,
        !post.is_self && post.url,
        post.selftext.trim() && post.selftext,
        comments.length && "## Comments",
        ...comments,
      ],
    };
  };

  const github = () => {
    // A missing container, or one with no text, reads as nothing and is skipped.
    const read = (container, author) => {
      const text = container?.querySelector(".markdown-body")?.textContent.trim();
      return text && { author: container.querySelector(author)?.textContent.trim() || "unknown", text };
    };

    // Issue pages and pull request pages use different markup.
    const issue = document.querySelector('[data-testid="issue-body"]');
    const pull = document.querySelector(".timeline-comment");
    const post = issue ? read(issue, '[data-testid="issue-body-header-author"]') : read(pull, "a.author");
    if (!post) throw new Error("no post on this page");

    const comments = issue
      ? [...document.querySelectorAll(".react-issue-comment")].map((comment) =>
          read(comment, '[data-testid="avatar-link"]'),
        )
      : [...document.querySelectorAll(".timeline-comment, .review-comment")]
          .filter((comment) => comment !== pull)
          .map((comment) => read(comment, "a.author"));
    const shown = comments.filter(Boolean).flatMap(({ author, text }) => [`**@${author}**`, text]);

    return {
      title: document.title,
      blocks: [`# ${document.title}`, `@${post.author}`, post.text, shown.length && "## Comments", ...shown],
    };
  };

  const site =
    /(^|\.)reddit\.com$/.test(location.hostname) && /\/comments\/\w/.test(location.pathname)
      ? reddit
      : location.hostname === "github.com" && /^\/[^/]+\/[^/]+\/(issues|pull)\/\d+(\/|$)/.test(location.pathname)
        ? github
        : null;
  // A site reader that fails for any reason leaves the page to Readability.
  if (site) {
    try {
      const { title, blocks } = await site();
      const body = blocks.filter(Boolean).join("\n\n");
      if (typeof title === "string" && body.trim()) return { ...page, title, body };
    } catch {}
  }

  // Readability rewrites the document it is given, so it gets a copy.
  const article = new Readability(document.cloneNode(true)).parse();
  if (!article?.textContent?.trim()) return { error: "nothing readable on this page" };
  return { ...page, title: article.title || document.title, body: article.textContent };
})();
