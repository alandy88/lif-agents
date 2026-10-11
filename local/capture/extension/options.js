const api = globalThis.browser ?? chrome;

(async () => {
  const { kind } = await api.storage.local.get("kind");
  for (const input of document.querySelectorAll("input[name=kind]")) {
    input.checked = input.value === (kind === "pi" ? "pi" : "claude");
    input.addEventListener("change", () => api.storage.local.set({ kind: input.value }));
  }
})();
