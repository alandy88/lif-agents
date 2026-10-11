import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";

const extension = path.resolve("local/capture/extension");
const read = (name: string) => readFileSync(path.join(extension, name), "utf8");

test("the manifest is MV3 for both browsers and asks for nothing extra", () => {
  const manifest = JSON.parse(read("manifest.json")) as Record<string, any>;

  assert.equal(manifest["manifest_version"], 3);
  assert.deepEqual(manifest["permissions"], ["nativeMessaging", "activeTab", "scripting"]);
  assert.equal("host_permissions" in manifest, false);
  assert.equal("content_scripts" in manifest, false);
  assert.equal(manifest["background"].service_worker, manifest["background"].scripts[0]);
  assert.equal(manifest["background"].scripts.length, 1);
  assert.equal(manifest["browser_specific_settings"].gecko.id, "lif-capture@alandy88.github");

  const popup = manifest["action"].default_popup as string;
  const referenced = [
    manifest["background"].service_worker as string,
    popup,
    ...[...read(popup).matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1] ?? ""),
    // The files the background script injects.
    ...[...read("background.js").matchAll(/"([\w/.-]+\.js)"/g)].map((match) => match[1] ?? ""),
  ];
  assert.ok(referenced.includes("popup.js"));
  assert.ok(referenced.includes("vendor/Readability.js"));
  assert.ok(referenced.includes("reader.js"));
  for (const file of referenced) {
    assert.ok(existsSync(path.join(extension, file)), `${file} is referenced but missing`);
  }
  assert.ok(existsSync(path.join(extension, "vendor/LICENSE")));
});

interface Page {
  selection: string;
  article: { title: string; textContent: string } | null;
}

/** Evaluates reader.js the way `scripting.executeScript` does: for its completion value. */
function readPage(page: Page) {
  const clone = { cloned: true };
  const given: unknown[] = [];
  const document = { title: "Document title", cloneNode: (deep: boolean) => (deep ? clone : null) };
  class Readability {
    constructor(doc: unknown) {
      given.push(doc);
    }
    parse() {
      return page.article;
    }
  }
  const result = vm.runInContext(
    read("reader.js"),
    vm.createContext({
      document,
      location: { hostname: "example.com", href: "https://example.com/a" },
      getSelection: () => ({ toString: () => page.selection }),
      Readability,
    }),
  ) as Record<string, string>;
  return { result: { ...result }, given, clone };
}

test("the reader returns the selection without running Readability", () => {
  const { result, given } = readPage({
    selection: "picked text",
    article: { title: "Article title", textContent: "article text" },
  });

  assert.equal(result["body"], "picked text");
  assert.equal(result["title"], "Document title");
  assert.equal(result["site"], "example.com");
  assert.equal(result["url"], "https://example.com/a");
  assert.deepEqual(given, []);
});

test("the reader runs Readability on a clone of the document", () => {
  const { result, given, clone } = readPage({
    selection: "",
    article: { title: "Article title", textContent: " article text\n" },
  });

  assert.equal(given.length, 1);
  assert.equal(given[0], clone);
  assert.deepEqual(Object.keys(result).sort(), ["body", "captured", "site", "title", "url"]);
  assert.equal(result["body"], " article text\n");
  assert.equal(result["title"], "Article title");
  assert.equal(new Date(result["captured"] ?? "").toISOString(), result["captured"]);
});

test("the reader reports an error when nothing is readable", () => {
  const { result } = readPage({ selection: "", article: null });

  assert.deepEqual(result, { error: "nothing readable on this page" });
});
