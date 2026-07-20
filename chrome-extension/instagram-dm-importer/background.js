const DEFAULT_SETTINGS = {
  serverUrl: "https://lofiesthetic.com",
  importToken: "extension-v1",
  autoSave: false,
};

function normalizeServerUrl(value) {
  return String(value || DEFAULT_SETTINGS.serverUrl).trim().replace(/\/+$/, "") || DEFAULT_SETTINGS.serverUrl;
}

async function getSettings() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return {
    serverUrl: normalizeServerUrl(settings.serverUrl),
    importToken: String(settings.importToken || DEFAULT_SETTINGS.importToken).trim(),
    autoSave: Boolean(settings.autoSave),
  };
}

function getImportUrl(serverUrl) {
  const baseUrl = normalizeServerUrl(serverUrl);
  if (baseUrl === "http://localhost:5173" || baseUrl === "http://127.0.0.1:5173") {
    return `${baseUrl}/api/local/instagram-extension/import`;
  }
  return `${baseUrl}/api/instagram-extension/import`;
}

async function importConversations(conversations) {
  const settings = await getSettings();
  const response = await fetch(getImportUrl(settings.serverUrl), {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Lofi-Instagram-Importer": settings.importToken,
    },
    body: JSON.stringify({ conversations }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Failed to save Instagram conversations");
  return data;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "LOFI_GET_IMPORTER_SETTINGS") {
    getSettings()
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, message: error.message || "Failed to load settings" }));
    return true;
  }

  if (message?.type === "LOFI_SAVE_IMPORTER_SETTINGS") {
    const settings = {
      serverUrl: normalizeServerUrl(message.settings?.serverUrl),
      importToken: String(message.settings?.importToken || DEFAULT_SETTINGS.importToken).trim(),
      autoSave: Boolean(message.settings?.autoSave),
    };
    chrome.storage.sync.set(settings)
      .then(() => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, message: error.message || "Failed to save settings" }));
    return true;
  }

  if (message?.type !== "LOFI_IMPORT_INSTAGRAM_CONVERSATIONS") return false;

  (async () => {
    const conversations = Array.isArray(message.conversations) ? message.conversations : [];
    const data = await importConversations(conversations);
    sendResponse({ ok: true, ...data });
  })().catch((error) => {
    sendResponse({ ok: false, message: error.message || "Failed to save Instagram conversations" });
  });

  return true;
});