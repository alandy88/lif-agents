#!/usr/bin/env python3
"""Print one Apple Human Interface Guidelines page as plain Markdown.

Usage: hig.py [slug]   e.g. hig.py buttons; no slug prints the root index.
Links to other guide pages render as [→ slug].
"""
import json
import sys
import urllib.error
import urllib.request

BASE = "https://developer.apple.com/tutorials/data/design/human-interface-guidelines"


def fetch(slug):
    url = f"{BASE}/{slug}.json" if slug else f"{BASE}.json"
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as err:
        sys.exit(f"hig.py: no page '{slug}' ({err.code}); run hig.py with no slug for the index")


def slug_of(identifier):
    return identifier.rstrip("/").rsplit("/", 1)[-1].lower()


class Renderer:
    def __init__(self, refs):
        self.refs = refs

    def inline(self, items):
        out = []
        for it in items or []:
            t = it.get("type")
            if t == "text":
                out.append(it.get("text", ""))
            elif t == "strong":
                out.append(f"**{self.inline(it.get('inlineContent'))}**")
            elif t == "emphasis":
                out.append(f"*{self.inline(it.get('inlineContent'))}*")
            elif t == "codeVoice":
                out.append(f"`{it.get('code', '')}`")
            elif t == "reference":
                ident = it.get("identifier", "")
                ref = self.refs.get(ident, {})
                title = ref.get("title") or slug_of(ident)
                if ref.get("type") == "topic" and "com.apple.HIG" in ident:
                    out.append(f"{title} [→ {slug_of(ident)}]")
                else:
                    url = ref.get("url", ident)
                    if url.startswith("/"):
                        url = "https://developer.apple.com" + url
                    out.append(f"{title} <{url}>")
        return "".join(out)

    def blocks(self, items, depth=0):
        lines = []
        for b in items or []:
            t = b.get("type")
            if t == "heading":
                lines += ["", "#" * min(b.get("level", 2) + 1, 6) + " " + b.get("text", "")]
            elif t == "paragraph":
                text = self.inline(b.get("inlineContent")).strip()
                if text:
                    lines += ["", text]
            elif t in ("unorderedList", "orderedList"):
                lines.append("")
                for n, item in enumerate(b.get("items", []), 1):
                    body = " ".join(l for l in self.blocks(item.get("content")) if l.strip())
                    lines.append(f"{'  ' * depth}{'-' if t == 'unorderedList' else f'{n}.'} {body}")
            elif t == "table":
                rows = [
                    [" ".join(l for l in self.blocks(cell) if l.strip()) for cell in row]
                    for row in b.get("rows", [])
                ]
                if rows:
                    lines += ["", "| " + " | ".join(rows[0]) + " |", "|" + "---|" * len(rows[0])]
                    lines += ["| " + " | ".join(r) + " |" for r in rows[1:]]
            elif t == "aside":
                body = " ".join(l for l in self.blocks(b.get("content")) if l.strip())
                lines += ["", f"> **{b.get('name') or b.get('style', 'Note')}:** {body}"]
            elif t == "tabNavigator":
                for tab in b.get("tabs", []):
                    lines += ["", f"**[{tab.get('title')}]**"] + self.blocks(tab.get("content"))
            elif t == "row":
                for col in b.get("columns", []):
                    lines += self.blocks(col.get("content"))
            elif t == "links":
                for ident in b.get("items", []):
                    lines.append(f"- {self.inline([{'type': 'reference', 'identifier': ident}])}")
            elif "content" in b:
                lines += self.blocks(b["content"], depth)
        return lines


def main():
    slug = sys.argv[1].split("#")[0].strip().lower() if len(sys.argv) > 1 else ""
    data = fetch(slug)
    refs = data.get("references", {})
    r = Renderer(refs)
    meta = data.get("metadata", {})
    custom = meta.get("customMetadata", {})
    lines = [f"# {meta.get('title', slug or 'Human Interface Guidelines')}"]
    abstract = r.inline(data.get("abstract"))
    if abstract:
        lines += ["", abstract]
    if custom.get("supported-platforms"):
        lines.append(f"\nPlatforms: {custom['supported-platforms']}")
    if custom.get("alert-date"):
        lines.append(f"Last change {custom['alert-date']}: {custom.get('alert-text', '')}")
    for section in data.get("primaryContentSections", []):
        lines += r.blocks(section.get("content"))
    for section in data.get("topicSections", []):
        lines += ["", f"## {section.get('title') or 'Topics'}"]
        for ident in section.get("identifiers", []):
            ref = refs.get(ident, {})
            lines.append(f"- {slug_of(ident)}: {ref.get('title', '')}. {r.inline(ref.get('abstract'))}")
    print("\n".join(lines).strip())


if __name__ == "__main__":
    main()
