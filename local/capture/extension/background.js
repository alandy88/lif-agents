// Does the capture here, not in the popup: a popup closes when it loses focus,
// and the capture must outlive it.

const api = globalThis.browser ?? chrome;

async function capture({ action, kind }) {
  const [tab] = await api.tabs.query({ active: true, lastFocusedWindow: true });
  const [injected] = await api.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["vendor/Readability.js", "reader.js"],
  });
  const page = injected?.result;
  if (!page || page.error) throw new Error(page?.error ?? "could not read this page");

  const reply = await api.runtime.sendNativeMessage("lif_capture", { ...page, kind, action });
  if (!reply?.ok) throw new Error(reply?.error ?? "the helper sent no reply");
  return reply;
}

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  api.action.setBadgeText({ text: "" });
  capture(message).then(sendResponse, (error) => {
    api.action.setBadgeText({ text: "!" });
    sendResponse({ ok: false, error: error.message });
  });
  // Keeps sendResponse usable after this listener returns.
  return true;
});
