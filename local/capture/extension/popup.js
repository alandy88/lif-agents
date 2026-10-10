const api = globalThis.browser ?? chrome;

const status = document.getElementById("status");
const buttons = document.querySelectorAll("button[data-action]");

// localStorage, so the choice survives without the `storage` permission.
const saved = localStorage.getItem("kind");
for (const input of document.querySelectorAll("input[name=kind]")) {
  if (input.value === saved) input.checked = true;
  input.addEventListener("change", () => localStorage.setItem("kind", input.value));
}

for (const button of buttons) {
  button.addEventListener("click", async () => {
    const kind = document.querySelector("input[name=kind]:checked").value;
    for (const each of buttons) each.disabled = true;
    status.textContent = "Capturing...";
    try {
      const reply = await api.runtime.sendMessage({ action: button.dataset.action, kind });
      status.textContent = reply.ok ? `Sent to ${reply.agent} (${reply.file})` : reply.error;
    } catch (error) {
      status.textContent = error.message;
    }
    for (const each of buttons) each.disabled = false;
  });
}
