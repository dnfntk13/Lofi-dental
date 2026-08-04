const statusEl = document.getElementById("status");
const openInstagramButton = document.getElementById("openInstagram");
const sync3DaysButton = document.getElementById("sync3Days");
const sync7DaysButton = document.getElementById("sync7Days");
const testServerButton = document.getElementById("testServer");
const saveCurrentDmButton = document.getElementById("saveCurrentDm");
const aiReadScreenButton = document.getElementById("aiReadScreen");
const serverUrlInput = document.getElementById("serverUrl");
const importTokenInput = document.getElementById("importToken");
const autoSaveInput = document.getElementById("autoSave");
const autoScanDmsInput = document.getElementById("autoScanDms");
const saveSettingsButton = document.getElementById("saveSettings");

function setStatus(message) {
  statusEl.textContent = message;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function getSyncOptions(daysBack) {
  return {
    daysBack,
    maxThreads: 500,
    maxListScrolls: daysBack <= 3 ? 220 : 500,
    maxMessageScrolls: 24,
  };
}

async function sendScanMessage(tabId, daysBack) {
  const options = getSyncOptions(daysBack);
  try {
    return await chrome.tabs.sendMessage(tabId, {
      type: "LOFI_SCAN_INSTAGRAM_DMS",
      options,
    });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return chrome.tabs.sendMessage(tabId, {
      type: "LOFI_SCAN_INSTAGRAM_DMS",
      options,
    });
  }
}

async function ensureImporterOnTab(tabId) {
  for (let index = 0; index < 18; index += 1) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: "LOFI_IMPORTER_PING" });
      if (result?.ok) return result;
    } catch {
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      } catch {
        await sleep(500);
        continue;
      }
    }

    await sleep(500);
  }

  throw new Error("Could not apply Lofi Importer to the Instagram tab yet. Reload the Instagram tab and try again.");
}

async function sendCurrentDmSaveMessage(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "LOFI_SAVE_CURRENT_INSTAGRAM_DM" });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return chrome.tabs.sendMessage(tabId, { type: "LOFI_SAVE_CURRENT_INSTAGRAM_DM" });
  }
}

async function sendAiReadScreenMessage(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "LOFI_AI_READ_VISIBLE_INSTAGRAM_SCREEN" });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return chrome.tabs.sendMessage(tabId, { type: "LOFI_AI_READ_VISIBLE_INSTAGRAM_SCREEN" });
  }
}

async function loadSettings() {
  const result = await chrome.runtime.sendMessage({ type: "LOFI_GET_IMPORTER_SETTINGS" });
  if (!result?.ok) throw new Error(result?.message || "Failed to load settings");
  serverUrlInput.value = result.settings.serverUrl || "https://lofiesthetic.com";
  importTokenInput.value = result.settings.importToken || "extension-v1";
  autoSaveInput.checked = Boolean(result.settings.autoSave);
  autoScanDmsInput.checked = Boolean(result.settings.autoScanDms);
}

async function saveSettings() {
  const result = await chrome.runtime.sendMessage({
    type: "LOFI_SAVE_IMPORTER_SETTINGS",
    settings: {
      serverUrl: serverUrlInput.value,
      importToken: importTokenInput.value,
      autoSave: autoSaveInput.checked,
      autoScanDms: autoScanDmsInput.checked,
    },
  });
  if (!result?.ok) throw new Error(result?.message || "Failed to save settings");
}

openInstagramButton.addEventListener("click", async () => {
  setStatus("Opening Instagram Direct...");
  const tab = await getInstagramTab();
  try {
    autoSaveInput.checked = true;
    autoScanDmsInput.checked = true;
    await saveSettings();
    await ensureImporterOnTab(tab.id);
    setStatus("Instagram reader is on. Keep this tab visible so Admin AI can read saved DMs.");
  } catch (error) {
    setStatus(error.message || "Instagram opened. Reload the tab if the importer panel does not appear.");
  }
});

async function runRangeSync(daysBack, button) {
  button.disabled = true;
  setStatus(`Starting ${daysBack === 3 ? "recent 3 days" : "recent 1 week"} sync...`);
  try {
    await saveSettings();
    const tab = await getInstagramTab();
    const result = await sendScanMessage(tab.id, daysBack);
    if (!result?.ok) throw new Error(result?.message || "Scan failed");
    setStatus(`Admin AI can now read recent DMs. Saved ${result.savedCount || 0}; skipped ${result.skippedCount || 0}.`);
  } catch (error) {
    setStatus(error.message || "Recent DM sync failed.");
  } finally {
    button.disabled = false;
  }
}

sync3DaysButton.addEventListener("click", () => runRangeSync(3, sync3DaysButton));
sync7DaysButton.addEventListener("click", () => runRangeSync(7, sync7DaysButton));

testServerButton.addEventListener("click", async () => {
  testServerButton.disabled = true;
  setStatus("Testing server save...");
  try {
    await saveSettings();
    const result = await chrome.runtime.sendMessage({ type: "LOFI_TEST_IMPORTER_SAVE" });
    if (!result?.ok) throw new Error(result?.message || "Server save test failed");
    setStatus(`Server OK. Saved ${result.savedCount || 0}; skipped ${result.skippedCount || 0}.`);
  } catch (error) {
    setStatus(error.message || "Server save test failed.");
  } finally {
    testServerButton.disabled = false;
  }
});

saveCurrentDmButton.addEventListener("click", async () => {
  saveCurrentDmButton.disabled = true;
  setStatus("Saving the open DM thread...");
  try {
    await saveSettings();
    const tab = await getInstagramTab();
    const result = await sendCurrentDmSaveMessage(tab.id);
    if (!result?.ok) throw new Error(result?.message || "Current DM save failed");
    setStatus(`Saved open DM: ${result.title || "Instagram DM"} (${result.messageCount || 0} lines). Saved ${result.savedCount || 0}; skipped ${result.skippedCount || 0}.`);
  } catch (error) {
    setStatus(error.message || "Current DM save failed.");
  } finally {
    saveCurrentDmButton.disabled = false;
  }
});

aiReadScreenButton.addEventListener("click", async () => {
  aiReadScreenButton.disabled = true;
  setStatus("AI is reading the visible Instagram DM screen...");
  try {
    await saveSettings();
    const tab = await getInstagramTab();
    const result = await sendAiReadScreenMessage(tab.id);
    if (!result?.ok) throw new Error(result?.message || "AI screen read failed");
    const readCount = result.read?.conversations?.length || 0;
    const summary = result.read?.summary ? ` ${result.read.summary}` : "";
    setStatus(`AI read ${readCount} conversation${readCount === 1 ? "" : "s"}; saved ${result.savedCount || 0}; skipped ${result.skippedCount || 0}.${summary}`);
  } catch (error) {
    setStatus(error.message || "AI screen read failed.");
  } finally {
    aiReadScreenButton.disabled = false;
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