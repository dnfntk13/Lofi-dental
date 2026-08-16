const DENTWEB_BRIDGE_CHANNEL = "lofi-dentweb-browser-controller";

if (location.pathname.startsWith("/admin")) {
  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.data?.channel !== DENTWEB_BRIDGE_CHANNEL || event.data?.direction !== "request") return;

    const requestId = String(event.data.requestId || "");
    if (!requestId) return;

    try {
      const response = await chrome.runtime.sendMessage({
        channel: DENTWEB_BRIDGE_CHANNEL,
        command: event.data.command,
        action: event.data.action,
      });
      window.postMessage({
        channel: DENTWEB_BRIDGE_CHANNEL,
        direction: "response",
        requestId,
        response,
      }, location.origin);
    } catch (error) {
      window.postMessage({
        channel: DENTWEB_BRIDGE_CHANNEL,
        direction: "response",
        requestId,
        response: { ok: false, message: error instanceof Error ? error.message : "Extension request failed" },
      }, location.origin);
    }
  });

  window.postMessage({ channel: DENTWEB_BRIDGE_CHANNEL, direction: "ready" }, location.origin);
}
