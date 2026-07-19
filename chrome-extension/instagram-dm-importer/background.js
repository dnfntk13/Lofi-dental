const LOCAL_IMPORT_URL = "http://localhost:5173/api/local/instagram-extension/import";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "LOFI_IMPORT_INSTAGRAM_CONVERSATIONS") return false;

  (async () => {
    const conversations = Array.isArray(message.conversations) ? message.conversations : [];
    const response = await fetch(LOCAL_IMPORT_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Lofi-Instagram-Importer": "extension-v1",
      },
      body: JSON.stringify({ conversations }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Failed to save Instagram conversations");
    sendResponse({ ok: true, ...data });
  })().catch((error) => {
    sendResponse({ ok: false, message: error.message || "Failed to save Instagram conversations" });
  });

  return true;
});