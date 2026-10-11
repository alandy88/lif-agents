// Does the capture here, not in the popup: a popup closes when it loses focus,
// and the capture must outlive it.

const api = globalThis.browser ?? chrome;

const actions = { digest: "Digest", explain: "Explain", note: "Note" };

async function capture(action, findTab) {
  const tab = await findTab();
  // The saved agent is the only source: nothing a sender puts in a message can set it.
  const { kind } = await api.storage.local.get("kind");
  const [injected] = await api.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["vendor/Readability.js", "reader.js"],
  });
  const page = injected?.result;
  if (!page || page.error) throw new Error(page?.error ?? "could not read this page");

  const reply = await api.runtime.sendNativeMessage("lif_capture", {
    ...page,
    kind: kind === "pi" ? "pi" : "claude",
    action,
  });
  if (!reply?.ok) throw new Error(reply?.error ?? "the helper sent no reply");
  return reply;
}

async function run(action, findTab) {
  api.action.setBadgeText({ text: "" });
  try {
    return await capture(action, findTab);
  } catch (error) {
    api.action.setBadgeText({ text: "!" });
    return { ok: false, error: error.message };
  }
}

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  run(message.action, async () => {
    const [tab] = await api.tabs.query({ active: true, lastFocusedWindow: true });
    return tab;
  }).then(sendResponse);
  // Keeps sendResponse usable after this listener returns.
  return true;
});

// On install and update only, after a removeAll, so a background restart does not duplicate the items.
api.runtime.onInstalled.addListener(async () => {
  await api.contextMenus.removeAll();
  for (const [id, title] of Object.entries(actions)) {
    api.contextMenus.create({ id, title, contexts: ["page", "selection"] });
  }
});

api.contextMenus.onClicked.addListener((info, tab) => {
  if (Object.hasOwn(actions, info.menuItemId)) run(info.menuItemId, () => tab);
});
