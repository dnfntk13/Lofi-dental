const DEFAULT_SETTINGS = {
  serverUrl: "https://lofiesthetic.com",
  importToken: "extension-v1",
  autoSave: true,
  autoScanDms: true,
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
    autoScanDms: Boolean(settings.autoScanDms),
  };
}

function getImportUrl(serverUrl) {
  const baseUrl = normalizeServerUrl(serverUrl);
  if (baseUrl === "http://localhost:5173" || baseUrl === "http://127.0.0.1:5173") {
    return `${baseUrl}/api/local/instagram-extension/import`;
  }
  return `${baseUrl}/api/instagram-extension/import`;
}

function getAiReadUrl(serverUrl) {
  const baseUrl = normalizeServerUrl(serverUrl);
  if (baseUrl === "http://localhost:5173" || baseUrl === "http://127.0.0.1:5173") {
    return `${baseUrl}/api/local/instagram-extension/ai-read-screen`;
  }
  return `${baseUrl}/api/instagram-extension/ai-read-screen`;
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

async function aiReadInstagramScreen(snapshot) {
  const settings = await getSettings();
  const response = await fetch(getAiReadUrl(settings.serverUrl), {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Lofi-Instagram-Importer": settings.importToken,
    },
    body: JSON.stringify({ snapshot }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Failed to AI-read Instagram screen");
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
      autoScanDms: Boolean(message.settings?.autoScanDms),
    };
    chrome.storage.sync.set(settings)
      .then(() => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, message: error.message || "Failed to save settings" }));
    return true;
  }

  if (message?.type === "LOFI_TEST_IMPORTER_SAVE") {
    const capturedAt = new Date().toISOString();
    const conversation = {
      senderId: `extension-test-${Date.now()}`,
      threadId: "extension-test",
      title: "Extension server test",
      url: "https://www.instagram.com/direct/t/extension-test/",
      capturedAt,
      messages: [{ text: `Extension server save test at ${capturedAt}` }],
      text: `Extension server save test at ${capturedAt}`,
    };
    importConversations([conversation])
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((error) => sendResponse({ ok: false, message: error.message || "Server save test failed" }));
    return true;
  }

  if (message?.type === "LOFI_AI_READ_INSTAGRAM_SCREEN") {
    aiReadInstagramScreen(message.snapshot || {})
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((error) => sendResponse({ ok: false, message: error.message || "AI screen read failed" }));
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