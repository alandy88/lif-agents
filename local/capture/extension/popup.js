const api = globalThis.browser ?? chrome;

const status = document.getElementById("status");
const buttons = document.querySelectorAll("button[data-action]");

for (const button of buttons) {
  button.addEventListener("click", async () => {
    for (const each of buttons) each.disabled = true;
    status.textContent = "Capturing...";
    try {
      const reply = await api.runtime.sendMessage({ action: button.dataset.action });
      status.textContent = reply.ok ? `Sent to ${reply.agent} (${reply.file})` : reply.error;
    } catch (error) {
      status.textContent = error.message;
    }
    for (const each of buttons) each.disabled = false;
  });
}
