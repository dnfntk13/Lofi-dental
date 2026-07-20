const statusEl = document.getElementById("status");
const openInstagramButton = document.getElementById("openInstagram");
const scanButton = document.getElementById("scanDms");
const serverUrlInput = document.getElementById("serverUrl");
const importTokenInput = document.getElementById("importToken");
const autoSaveInput = document.getElementById("autoSave");
const saveSettingsButton = document.getElementById("saveSettings");

function setStatus(message) {
  statusEl.textContent = message;
}

async function getInstagramTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.url?.startsWith("https://www.instagram.com/direct/")) return activeTab;

  const tabs = await chrome.tabs.query({ url: "https://www.instagram.com/direct/*" });
  if (tabs[0]) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    return tabs[0];
  }

  return chrome.tabs.create({ url: "https://www.instagram.com/direct/inbox/" });
}

async function sendScanMessage(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, {
      type: "LOFI_SCAN_INSTAGRAM_DMS",
      options: { maxThreads: 80, maxListScrolls: 30, maxMessageScrolls: 30 },
    });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return chrome.tabs.sendMessage(tabId, {
      type: "LOFI_SCAN_INSTAGRAM_DMS",
      options: { maxThreads: 80, maxListScrolls: 30, maxMessageScrolls: 30 },
    });
  }
}

async function loadSettings() {
  const result = await chrome.runtime.sendMessage({ type: "LOFI_GET_IMPORTER_SETTINGS" });
  if (!result?.ok) throw new Error(result?.message || "Failed to load settings");
  serverUrlInput.value = result.settings.serverUrl || "https://lofiesthetic.com";
  importTokenInput.value = result.settings.importToken || "extension-v1";
  autoSaveInput.checked = Boolean(result.settings.autoSave);
}

async function saveSettings() {
  const result = await chrome.runtime.sendMessage({
    type: "LOFI_SAVE_IMPORTER_SETTINGS",
    settings: {
      serverUrl: serverUrlInput.value,
      importToken: importTokenInput.value,
      autoSave: autoSaveInput.checked,
    },
  });
  if (!result?.ok) throw new Error(result?.message || "Failed to save settings");
}

openInstagramButton.addEventListener("click", async () => {
  setStatus("Opening Instagram Direct...");
  await getInstagramTab();
  setStatus("Log in if needed, then click Scan & save DMs.");
});

scanButton.addEventListener("click", async () => {
  scanButton.disabled = true;
  setStatus("Starting scan...");
  try {
    const tab = await getInstagramTab();
    const result = await sendScanMessage(tab.id);
    if (!result?.ok) throw new Error(result?.message || "Scan failed");
    setStatus(`Saved ${result.savedCount || 0}; skipped ${result.skippedCount || 0}.`);
  } catch (error) {
    setStatus(error.message || "Scan failed.");
  } finally {
    scanButton.disabled = false;
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "LOFI_SCAN_STATUS") setStatus(message.status);
});

saveSettingsButton.addEventListener("click", async () => {
  saveSettingsButton.disabled = true;
  setStatus("Saving settings...");
  try {
    await saveSettings();
    setStatus("Settings saved.");
  } catch (error) {
    setStatus(error.message || "Failed to save settings.");
  } finally {
    saveSettingsButton.disabled = false;
  }
});

loadSettings().catch((error) => setStatus(error.message || "Failed to load settings."));