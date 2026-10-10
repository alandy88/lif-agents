// Injected after vendor/Readability.js. A classic script: the value of this one
// expression is the capture the background script receives. It declares nothing
// at the top level, so injecting it into the same tab twice is safe.

(() => {
  const page = {
    site: location.hostname,
    url: location.href,
    captured: new Date().toISOString(),
  };

  const selection = String(getSelection());
  if (selection.trim()) return { ...page, title: document.title, body: selection };

  // Readability rewrites the document it is given, so it gets a copy.
  const article = new Readability(document.cloneNode(true)).parse();
  if (!article?.textContent?.trim()) return { error: "nothing readable on this page" };
  return { ...page, title: article.title || document.title, body: article.textContent };
})();
