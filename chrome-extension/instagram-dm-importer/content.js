const LOFI_SCAN_DELAY_MS = 650;
const LOFI_AUTO_SAVE_DEBOUNCE_MS = 2400;
const LOFI_AUTO_SCAN_INTERVAL_MS = 5 * 60 * 1000;
let autoSaveTimer = null;
let lastAutoSaveSignature = "";
let autoScanTimer = null;
let autoScanInProgress = false;

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

function findThreadAnchor(url) {
  const targetThreadId = getThreadIdFromUrl(url);
  return Array.from(document.querySelectorAll('a[href*="/direct/t/"]'))
    .find((anchor) => anchor.href === url || getThreadIdFromUrl(anchor.href) === targetThreadId);
}

async function findThreadAnchorByScrolling(url, maxScrolls = 25) {
  let anchor = findThreadAnchor(url);
  if (anchor) return anchor;

  const scrollTargets = getScrollableElements();
  for (const scrollTarget of scrollTargets) {
    scrollTarget.scrollTop = 0;
    await sleep(250);

    for (let index = 0; index < maxScrolls; index += 1) {
      anchor = findThreadAnchor(url);
      if (anchor) return anchor;
      scrollTarget.scrollTop += Math.max(320, scrollTarget.clientHeight * 0.75);
      await sleep(250);
    }
  }

  return null;
}

async function waitForThreadContent(threadUrl, timeoutMs = 7000) {
  const startedAt = Date.now();
  const threadId = getThreadIdFromUrl(threadUrl);

  while (Date.now() - startedAt < timeoutMs) {
    const isTargetThread = location.pathname.startsWith("/direct/t/") && (!threadId || getThreadIdFromUrl(location.href) === threadId);
    const conversation = collectCurrentConversation();
    if (isTargetThread && conversation?.text) return conversation;
    await sleep(300);
  }

  return collectCurrentConversation();
}

async function openThread(thread) {
  const anchor = await findThreadAnchorByScrolling(thread.url);
  if (!anchor) throw new Error(`Could not find DM thread link: ${thread.title}`);

  anchor.scrollIntoView({ block: "center" });
  await sleep(250);
  anchor.click();

  await sleep(1200);
  return waitForThreadContent(thread.url);
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

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanText(match[1]);
  }
  return "";
}

function extractReservationInfo(text, title = "") {
  const source = `${title}\n${text}`;
  const lower = source.toLowerCase();
  const reservationKeywords = [
    "예약", "상담", "방문", "진료", "가능", "appointment", "book", "booking", "reservation", "consult", "available", "visit", "schedule",
  ];
  const treatmentKeywords = [
    "라미네이트", "미백", "임플란트", "교정", "충치", "크라운", "베니어", "veneer", "whitening", "implant", "invisalign", "crown", "filling", "cleaning",
  ];
  const isReservationRelated = reservationKeywords.some((keyword) => lower.includes(keyword)) || treatmentKeywords.some((keyword) => lower.includes(keyword));

  const name = firstMatch(source, [
    /(?:이름|성함)\s*[:：]\s*([^\n,./]{2,40})/i,
    /(?:name)\s*[:：]\s*([^\n,./]{2,40})/i,
    /(?:저는|제 이름은|i am|i'm|my name is)\s+([^\n,.!?]{2,40})/i,
  ]);
  const phone = firstMatch(source, [
    /(01[016789][\s.-]?\d{3,4}[\s.-]?\d{4})/,
    /(\+?\d[\d\s().-]{7,}\d)/,
  ]);
  const date = firstMatch(source, [
    /(?:날짜|예약일|방문일|date|day)\s*[:：]?\s*([^\n,]{2,40})/i,
    /(\d{1,2}\s*월\s*\d{1,2}\s*일(?:\s*[가-힣]*)?)/,
    /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,?\s*\d{4})?)/i,
    /(\d{4}[./-]\d{1,2}[./-]\d{1,2})/,
    /(\d{1,2}[./-]\d{1,2})/,
  ]);
  const time = firstMatch(source, [
    /(?:시간|time)\s*[:：]?\s*([^\n,]{2,30})/i,
    /((?:오전|오후)\s*\d{1,2}\s*(?:시|:\d{2})?)/,
    /(\d{1,2}:\d{2}\s*(?:am|pm)?)/i,
    /(\d{1,2}\s*(?:am|pm))/i,
  ]);
  const concerns = firstMatch(source, [
    /(?:문의|상담|증상|고민|치료|concern|concerns|treatment)\s*[:：]\s*([^\n]{2,220})/i,
  ]) || source
    .split(/\n+/)
    .map(cleanText)
    .filter((line) => line.length > 4)
    .filter((line) => reservationKeywords.concat(treatmentKeywords).some((keyword) => line.toLowerCase().includes(keyword)))
    .slice(-4)
    .join(" / ");

  return {
    isReservationRelated,
    name,
    phone,
    date,
    time,
    concerns: cleanText(concerns).slice(0, 1200),
  };
}

function collectCurrentConversation() {
  if (!location.hostname.endsWith("instagram.com") || !location.pathname.startsWith("/direct/t/")) return null;
  const messages = extractConversationMessages();
  const text = messages.map((message) => message.text).join("\n");
  if (!text || text.length < 20) return null;

  const title = extractConversationTitle();
  return {
    senderId: getThreadIdFromUrl(location.href) || location.href,
    threadId: getThreadIdFromUrl(location.href),
    title,
    url: location.href,
    capturedAt: new Date().toISOString(),
    messages,
    text,
    reservationInfo: extractReservationInfo(text, title),
  };
}

async function getImporterSettings() {
  const result = await chrome.runtime.sendMessage({ type: "LOFI_GET_IMPORTER_SETTINGS" });
  return result?.ok ? result.settings : { autoSave: false };
}

async function autoSaveCurrentConversation() {
  const settings = await getImporterSettings();
  if (!settings.autoSave) return;

  const conversation = collectCurrentConversation();
  if (!conversation) return;

  const signature = `${conversation.threadId}:${conversation.text.slice(-1600)}`;
  if (signature === lastAutoSaveSignature) return;
  lastAutoSaveSignature = signature;

  const result = await chrome.runtime.sendMessage({
    type: "LOFI_IMPORT_INSTAGRAM_CONVERSATIONS",
    conversations: [conversation],
  });
  if (result?.ok) {
    chrome.runtime.sendMessage({
      type: "LOFI_SCAN_STATUS",
      status: `Auto-saved ${result.savedCount || 0}; skipped ${result.skippedCount || 0}.`,
    }).catch(() => {});
  }
}

async function autoScanInstagramDms() {
  const settings = await getImporterSettings();
  if (!settings.autoScanDms || autoScanInProgress || document.hidden) return;
  if (!location.hostname.endsWith("instagram.com") || !location.pathname.startsWith("/direct")) return;

  autoScanInProgress = true;
  try {
    chrome.runtime.sendMessage({ type: "LOFI_SCAN_STATUS", status: "Auto-scanning Instagram DMs..." }).catch(() => {});
    const result = await scanInstagramDms(
      { maxThreads: 80, maxListScrolls: 30, maxMessageScrolls: 30 },
      (status) => chrome.runtime.sendMessage({ type: "LOFI_SCAN_STATUS", status }).catch(() => {}),
    );
    chrome.runtime.sendMessage({
      type: "LOFI_SCAN_STATUS",
      status: `Auto-scan saved ${result.savedCount || 0}; skipped ${result.skippedCount || 0}.`,
    }).catch(() => {});
  } catch (error) {
    chrome.runtime.sendMessage({
      type: "LOFI_SCAN_STATUS",
      status: error.message || "Auto-scan failed.",
    }).catch(() => {});
  } finally {
    autoScanInProgress = false;
  }
}

function startAutoScanLoop() {
  window.clearInterval(autoScanTimer);
  autoScanTimer = window.setInterval(() => {
    autoScanInstagramDms().catch(() => {});
  }, LOFI_AUTO_SCAN_INTERVAL_MS);
  window.setTimeout(() => autoScanInstagramDms().catch(() => {}), 3500);
}

function scheduleAutoSave() {
  window.clearTimeout(autoSaveTimer);
  autoSaveTimer = window.setTimeout(() => {
    autoSaveCurrentConversation().catch(() => {});
  }, LOFI_AUTO_SAVE_DEBOUNCE_MS);
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
    onProgress?.(`Opening ${index + 1}/${threadLinks.length}: ${thread.title}`);
    let openedConversation = null;
    try {
      openedConversation = await openThread(thread);
    } catch (error) {
      onProgress?.(error.message || `Skipped ${thread.title}`);
      continue;
    }

    await scrollConversationToTop(maxMessageScrolls);
    await sleep(LOFI_SCAN_DELAY_MS);

    const messages = extractConversationMessages();
    const title = extractConversationTitle() || openedConversation?.title || thread.title;
    const text = messages.map((message) => message.text).join("\n");
    conversations.push({
      senderId: getThreadIdFromUrl(thread.url) || `thread-${index + 1}`,
      threadId: getThreadIdFromUrl(thread.url),
      title,
      url: thread.url,
      capturedAt: new Date().toISOString(),
      messages,
      text,
      reservationInfo: extractReservationInfo(text, title),
    });
  }

  const validConversations = conversations.filter((conversation) => cleanText(conversation.text).length >= 20);
  if (!validConversations.length) {
    throw new Error("No readable DM conversations found.");
  }

  onProgress?.(`Saving ${validConversations.length} DM conversation${validConversations.length === 1 ? "" : "s"}...`);
  const result = await chrome.runtime.sendMessage({
    type: "LOFI_IMPORT_INSTAGRAM_CONVERSATIONS",
    conversations: validConversations,
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

new MutationObserver(scheduleAutoSave).observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
});
window.addEventListener("popstate", scheduleAutoSave);
scheduleAutoSave();
startAutoScanLoop();