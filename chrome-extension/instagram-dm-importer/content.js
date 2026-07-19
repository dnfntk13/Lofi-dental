const LOFI_SCAN_DELAY_MS = 650;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getThreadIdFromUrl(url) {
  const match = String(url || "").match(/\/direct\/t\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function getScrollableElements() {
  return Array.from(document.querySelectorAll("main, section, div"))
    .filter((element) => element.scrollHeight > element.clientHeight + 120)
    .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
}

function getThreadLinks() {
  return Array.from(document.querySelectorAll('a[href*="/direct/t/"]'))
    .map((anchor) => ({
      url: anchor.href,
      title: cleanText(anchor.innerText).split("\n").filter(Boolean)[0] || "Instagram DM",
    }))
    .filter((item) => item.url)
    .filter((item, index, items) => items.findIndex((other) => other.url === item.url) === index);
}

async function collectThreadLinks(maxThreads, maxListScrolls, onProgress) {
  const links = new Map();

  for (let index = 0; index < maxListScrolls && links.size < maxThreads; index += 1) {
    getThreadLinks().forEach((item) => links.set(item.url, item));
    onProgress?.(`Found ${links.size} DM thread${links.size === 1 ? "" : "s"}...`);

    const scrollTarget = getScrollableElements()[0];
    if (scrollTarget) scrollTarget.scrollTop += Math.max(360, scrollTarget.clientHeight * 0.8);
    else window.scrollBy(0, window.innerHeight * 0.8);
    await sleep(LOFI_SCAN_DELAY_MS);
  }

  return Array.from(links.values()).slice(0, maxThreads);
}

async function scrollConversationToTop(maxMessageScrolls) {
  let lastTop = null;
  for (let index = 0; index < maxMessageScrolls; index += 1) {
    const scrollTarget = getScrollableElements()[0];
    if (!scrollTarget) {
      window.scrollTo(0, 0);
      await sleep(LOFI_SCAN_DELAY_MS);
      continue;
    }

    scrollTarget.scrollTop = 0;
    await sleep(LOFI_SCAN_DELAY_MS);
    if (lastTop === scrollTarget.scrollTop) break;
    lastTop = scrollTarget.scrollTop;
  }
}

function extractConversationTitle() {
  const candidates = [
    "main header h1",
    "main header h2",
    '[role="main"] h1',
    '[role="main"] h2',
    "header h1",
    "header h2",
  ];

  for (const selector of candidates) {
    const text = cleanText(document.querySelector(selector)?.textContent);
    if (text) return text;
  }
  return "Instagram DM";
}

function isChromeText(line) {
  return /^(instagram|home|search|explore|reels|messages|notifications|create|profile|threads|meta|send message|message|new message|note|search input|your story)$/i.test(line);
}

function extractConversationMessages() {
  const articleText = cleanText(document.querySelector("main")?.innerText || document.body.innerText || "");
  const lines = articleText
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean)
    .filter((line) => !isChromeText(line));

  const uniqueLines = [];
  for (const line of lines) {
    if (uniqueLines[uniqueLines.length - 1] !== line) uniqueLines.push(line);
  }

  return uniqueLines.map((text) => ({ text })).slice(-500);
}

async function scanInstagramDms(options = {}, onProgress) {
  const maxThreads = Math.min(Math.max(Number(options.maxThreads || 80), 1), 120);
  const maxListScrolls = Math.min(Math.max(Number(options.maxListScrolls || 30), 1), 80);
  const maxMessageScrolls = Math.min(Math.max(Number(options.maxMessageScrolls || 30), 1), 80);

  if (!location.hostname.endsWith("instagram.com") || !location.pathname.startsWith("/direct")) {
    throw new Error("Open Instagram Direct first: https://www.instagram.com/direct/inbox/");
  }

  onProgress?.("Scanning DM list...");
  const threadLinks = await collectThreadLinks(maxThreads, maxListScrolls, onProgress);
  if (!threadLinks.length) {
    throw new Error("No DM threads found. Make sure you are logged in and the DM list is visible.");
  }

  const conversations = [];
  for (let index = 0; index < threadLinks.length; index += 1) {
    const thread = threadLinks[index];
    onProgress?.(`Reading ${index + 1}/${threadLinks.length}: ${thread.title}`);
    history.pushState(null, "", thread.url);
    window.dispatchEvent(new PopStateEvent("popstate"));
    await sleep(1400);

    if (location.href !== thread.url) {
      location.href = thread.url;
      await sleep(1800);
    }

    await scrollConversationToTop(maxMessageScrolls);
    await sleep(LOFI_SCAN_DELAY_MS);

    const messages = extractConversationMessages();
    conversations.push({
      senderId: getThreadIdFromUrl(thread.url) || `thread-${index + 1}`,
      threadId: getThreadIdFromUrl(thread.url),
      title: extractConversationTitle() || thread.title,
      url: thread.url,
      capturedAt: new Date().toISOString(),
      messages,
      text: messages.map((message) => message.text).join("\n"),
    });
  }

  onProgress?.(`Saving ${conversations.length} conversation${conversations.length === 1 ? "" : "s"}...`);
  const result = await chrome.runtime.sendMessage({
    type: "LOFI_IMPORT_INSTAGRAM_CONVERSATIONS",
    conversations,
  });
  if (!result?.ok) throw new Error(result?.message || "Failed to save conversations");
  return result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "LOFI_SCAN_INSTAGRAM_DMS") return false;

  scanInstagramDms(message.options, (status) => {
    chrome.runtime.sendMessage({ type: "LOFI_SCAN_STATUS", status }).catch(() => {});
  })
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, message: error.message || "Instagram DM scan failed" }));

  return true;
});