const CHANNEL = "lofi-dentweb-browser-controller";
const REMOTE_ORIGIN = "https://remotedesktop.google.com/";
const attachedTabs = new Set();

function isRemoteDesktopTab(tab) {
  return Number.isInteger(tab?.id) && String(tab?.url || "").startsWith(REMOTE_ORIGIN);
}

async function findRemoteDesktopTab() {
  const tabs = (await chrome.tabs.query({})).filter(isRemoteDesktopTab);
  tabs.sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    return Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0);
  });
  return tabs[0] || null;
}

async function ensureAttached(tabId) {
  if (attachedTabs.has(tabId)) return;
  const targets = await chrome.debugger.getTargets();
  if (!targets.some((target) => target.tabId === tabId && target.attached)) {
    await chrome.debugger.attach({ tabId }, "1.3");
  }
  attachedTabs.add(tabId);
}

async function send(tabId, method, params = {}) {
  await ensureAttached(tabId);
  return chrome.debugger.sendCommand({ tabId }, method, params);
}

async function getViewport(tab) {
  try {
    const metrics = await send(tab.id, "Page.getLayoutMetrics");
    const viewport = metrics.cssVisualViewport || metrics.cssLayoutViewport;
    if (viewport?.clientWidth && viewport?.clientHeight) {
      return { width: viewport.clientWidth, height: viewport.clientHeight };
    }
  } catch {
    // Tab dimensions are a sufficient fallback for normalized coordinates.
  }
  return { width: Math.max(1, tab.width || 1), height: Math.max(1, tab.height || 1) };
}

function pointFor(action, viewport) {
  const x = Math.max(0, Math.min(1, Number(action?.x))) * viewport.width;
  const y = Math.max(0, Math.min(1, Number(action?.y))) * viewport.height;
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Invalid action coordinates");
  return { x, y };
}

async function click(tabId, point, clickCount = 1) {
  await send(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount });
  await send(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount });
}

const keyMap = {
  ENTER: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
  TAB: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
  ESCAPE: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
  BACKSPACE: { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 },
  DELETE: { key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 },
  ARROWUP: { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 },
  ARROWDOWN: { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 },
  ARROWLEFT: { key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 },
  ARROWRIGHT: { key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 },
  HOME: { key: "Home", code: "Home", windowsVirtualKeyCode: 36 },
  END: { key: "End", code: "End", windowsVirtualKeyCode: 35 },
  PAGEUP: { key: "PageUp", code: "PageUp", windowsVirtualKeyCode: 33 },
  PAGEDOWN: { key: "PageDown", code: "PageDown", windowsVirtualKeyCode: 34 }
};

async function executeAction(tab, action) {
  const type = String(action?.type || "").toLowerCase();
  const viewport = await getViewport(tab);

  if (type === "click" || type === "double_click") {
    await click(tab.id, pointFor(action, viewport), type === "double_click" ? 2 : 1);
  } else if (type === "scroll") {
    await send(tab.id, "Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: viewport.width / 2,
      y: viewport.height / 2,
      deltaX: 0,
      deltaY: Math.max(-1200, Math.min(1200, Number(action.deltaY) || 600)),
    });
  } else if (type === "type") {
    const text = String(action.text || "").slice(0, 1000);
    if (!text) throw new Error("No text to type");
    await send(tab.id, "Input.insertText", { text });
  } else if (type === "key") {
    const key = keyMap[String(action.key || "").toUpperCase()];
    if (!key) throw new Error("Unsupported key");
    await send(tab.id, "Input.dispatchKeyEvent", { type: "keyDown", ...key });
    await send(tab.id, "Input.dispatchKeyEvent", { type: "keyUp", ...key });
  } else if (type === "hotkey") {
    if (String(action.hotkey || "").toUpperCase() !== "CTRL+A") throw new Error("Unsupported hotkey");
    const key = { key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 };
    await send(tab.id, "Input.dispatchKeyEvent", { type: "keyDown", ...key });
    await send(tab.id, "Input.dispatchKeyEvent", { type: "keyUp", ...key });
  } else {
    throw new Error(`Unsupported browser action: ${type || "empty"}`);
  }

  return { ok: true, tabId: tab.id, title: tab.title || "Chrome Remote Desktop", viewport, actionType: type };
}

async function captureRemoteDesktop(tab) {
  const viewport = await getViewport(tab);
  const screenshot = await send(tab.id, "Page.captureScreenshot", {
    format: "jpeg",
    quality: 90,
    fromSurface: true,
    captureBeyondViewport: false,
  });
  if (!screenshot?.data) throw new Error("Could not capture the Chrome Remote Desktop tab");
  return {
    ok: true,
    tabId: tab.id,
    title: tab.title || "Chrome Remote Desktop",
    imageDataUrl: `data:image/jpeg;base64,${screenshot.data}`,
    width: Math.round(viewport.width),
    height: Math.round(viewport.height),
  };
}

chrome.debugger.onDetach.addListener(({ tabId }) => attachedTabs.delete(tabId));
chrome.tabs.onRemoved.addListener((tabId) => attachedTabs.delete(tabId));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.channel !== CHANNEL) return false;

  (async () => {
    const tab = await findRemoteDesktopTab();
    if (message.command === "status") {
      return { ok: true, installed: true, connected: Boolean(tab), tab: tab ? { id: tab.id, title: tab.title, url: tab.url } : null };
    }
    if (message.command === "execute") {
      if (!sender.tab?.url || !sender.tab.url.includes("/admin")) throw new Error("Commands are accepted only from the Lofi admin page");
      if (!tab) throw new Error("Open Chrome Remote Desktop in another tab first");
      return executeAction(tab, message.action || {});
    }
    if (message.command === "capture") {
      if (!sender.tab?.url || !sender.tab.url.includes("/admin")) throw new Error("Captures are accepted only from the Lofi admin page");
      if (!tab) throw new Error("Open Chrome Remote Desktop in another tab first");
      return captureRemoteDesktop(tab);
    }
    throw new Error("Unknown controller command");
  })().then(sendResponse).catch((error) => {
    sendResponse({ ok: false, message: error instanceof Error ? error.message : "Controller failed" });
  });

  return true;
});
