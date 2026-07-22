import { createServer } from "node:http";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import nodemailer from "nodemailer";
import Imap from "imap";
import { simpleParser } from "mailparser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;
const port = Number(process.env.PORT || 5173);
const adminUser = process.env.ADMIN_USER || "lofidental";
const adminPass = process.env.ADMIN_PASS || "Lofidental1!";
const adminSessionCookie = "admin_session";
const adminSessionValue = Buffer.from(`${adminUser}:${adminPass}`, "utf-8").toString("base64url");
const instagramClientId = process.env.INSTAGRAM_CLIENT_ID || "";
const instagramClientSecret = process.env.INSTAGRAM_CLIENT_SECRET || "";
const instagramRedirectUri = process.env.INSTAGRAM_REDIRECT_URI || "";
const instagramWebhookVerifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || "";
const instagramGraphApiVersion = process.env.INSTAGRAM_GRAPH_API_VERSION || "v21.0";
const instagramBusinessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || "";
const instagramAccessToken = process.env.INSTAGRAM_ACCESS_TOKEN || "";
const instagramExtensionImportToken = process.env.INSTAGRAM_EXTENSION_IMPORT_TOKEN || "extension-v1";
const renderDefaultServiceId = process.env.RENDER_SERVICE_ID || "srv-d8l6hspkh4rs73fqrtqg";
const renderApiKey = process.env.RENDER_API_KEY || "";
const instagramAdminUsers = (process.env.INSTAGRAM_ADMIN_USERS || "lofi_esthetic_dentistry")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const instagramAdminIds = (process.env.INSTAGRAM_ADMIN_IDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const dataDir = path.join(rootDir, ".data");
const inboxPath = path.join(dataDir, "reservation-inbox.json");
const emailThreadsPath = path.join(dataDir, "email-threads.json");
const imapProcessedPath = path.join(dataDir, "imap-processed.json");
const instagramSettingsPath = path.join(dataDir, "instagram-settings.json");
const trafficPath = path.join(dataDir, "traffic-events.json");
const mongoUri = process.env.MONGODB_URI || "";
const mongoDatabaseName = process.env.MONGODB_DB_NAME || "lofi-dental";
const mongoCollectionName = process.env.MONGODB_COLLECTION || "reservationMessages";
const patientsCollectionName = process.env.MONGODB_PATIENTS_COLLECTION || "patients";
const emailThreadsCollectionName = process.env.MONGODB_EMAIL_THREADS_COLLECTION || "emailThreads";
const trafficCollectionName = process.env.MONGODB_TRAFFIC_COLLECTION || "trafficEvents";
const patientsPath = path.join(dataDir, "patients.json");
let patientsCollectionPromise;
let emailThreadsCollectionPromise;
let trafficCollectionPromise;
const smtpHost = process.env.SMTP_HOST || "";
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER || "";
const smtpPass = process.env.SMTP_PASS || "";
const smtpFrom = process.env.SMTP_FROM || smtpUser;
const imapHost = process.env.IMAP_HOST || "";
const imapPort = Number(process.env.IMAP_PORT || 993);
const imapUser = process.env.IMAP_USER || smtpUser;
const imapPass = process.env.IMAP_PASS || smtpPass;
const imapSentMailboxes = (process.env.IMAP_SENT_MAILBOXES || "[Gmail]/Sent Mail,Sent,Sent Items")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const reservationNotifyTo = process.env.RESERVATION_NOTIFY_TO || "";
const resendApiKey = process.env.RESEND_API_KEY || "";
const resendFrom = process.env.RESEND_FROM || smtpFrom;
const emailDnsServers = (process.env.EMAIL_DNS_SERVERS || "8.8.8.8,1.1.1.1")
  .split(",")
  .map((server) => server.trim())
  .filter(Boolean);
let inboxCollectionPromise;
const emailVerificationCodes = new Map();
const verifiedEmails = new Map();
const instagramAuthStates = new Map();
const emailVerificationTtlMs = 10 * 60 * 1000;
const instagramAuthStateTtlMs = 10 * 60 * 1000;
const emailResolver = new Resolver();
emailResolver.setServers(emailDnsServers);
const trafficHashSecret = process.env.TRAFFIC_HASH_SECRET || adminSessionValue;
const maxLocalTrafficEvents = Number(process.env.TRAFFIC_LOCAL_LIMIT || 10000);
const reservationCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function resolvePath(urlPath) {
  const pathname = decodeURIComponent((urlPath || "/").split("?")[0]);
  if (pathname === "/") {
    return "/english/index.html";
  }

  if (["/korean", "/korean/", "/korean.html", "/index.html"].includes(pathname)) {
    return "/index.html";
  }

  if (["/english", "/english/", "/english.html"].includes(pathname)) {
    return "/english/index.html";
  }

  if (["/meetdrkim", "/meetdrkim/"].includes(pathname)) {
    return "/meetdrkim.html";
  }

  if (["/admin/calendar", "/admin/calendar/"].includes(pathname)) {
    return "/admin/calendar.html";
  }

  if (["/admin/messages", "/admin/messages/", "/admin/messages.html"].includes(pathname)) {
    return "/admin/patients.html";
  }

  if (["/admin/patients", "/admin/patients/"].includes(pathname)) {
    return "/admin/patients.html";
  }

  if (["/admin/instagram-settings", "/admin/instagram-settings/"].includes(pathname)) {
    return "/admin/instagram-settings.html";
  }

  if (["/admin/traffic", "/admin/traffic/"].includes(pathname)) {
    return "/admin/traffic.html";
  }

  if (["/admin", "/admin/"].includes(pathname)) {
    return "/admin/calendar.html";
  }

  if (["/admin/reply", "/admin/reply/"].includes(pathname)) {
    return "/admin/reply.html";
  }

  if (["/patient-reply", "/patient-reply/"].includes(pathname)) {
    return "/patient-reply.html";
  }

  if (["/reservation", "/reservation/"].includes(pathname)) {
    return "/reservation/index.html";
  }

  if (pathname === "/concerns.html") {
    return "/reservation/concerns.html";
  }

  if (pathname === "/received.html") {
    return "/reservation/received.html";
  }

  if (pathname.endsWith("/")) {
    return `${pathname}index.html`;
  }

  if (!path.extname(pathname)) {
    return `${pathname}/index.html`;
  }

  return pathname;
}

function parsePathname(urlPath) {
  return new URL(urlPath || "/", `http://localhost:${port}`).pathname;
}

function isMobileRequest(request) {
  const userAgent = String(request.headers["user-agent"] || "").toLowerCase();
  return /android|iphone|ipod|blackberry|iemobile|opera mini|mobile/.test(userAgent);
}

function getMobileRedirectPath(pathname) {
  if (["/", "/index.html"].includes(pathname)) {
    return "/mobile/";
  }

  if (["/english", "/english/", "/english.html"].includes(pathname)) {
    return "/mobile/";
  }

  return null;
}

async function getInboxCollection() {
  if (!mongoUri) {
    return null;
  }

  if (!inboxCollectionPromise) {
    inboxCollectionPromise = (async () => {
      const client = new MongoClient(mongoUri, {
        connectTimeoutMS: 8000,
        serverSelectionTimeoutMS: 8000,
      });
      await client.connect();
      const collection = client.db(mongoDatabaseName).collection(mongoCollectionName);
      await collection.createIndex({ id: 1 }, { unique: true });
      await collection.createIndex({ createdAt: -1 });
      return collection;
    })().catch((error) => {
      inboxCollectionPromise = undefined;
      throw error;
    });
  }

  return inboxCollectionPromise;
}

async function readInbox() {
  const collection = await getInboxCollection();
  if (collection) {
    return collection
      .find({}, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();
  }

  try {
    const data = await readFile(inboxPath, "utf-8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function addInboxRecord(record) {
  const collection = await getInboxCollection();
  if (collection) {
    await collection.insertOne(record);
    return;
  }

  const messages = await readInbox();
  messages.unshift(record);
  await mkdir(dataDir, { recursive: true });
  await writeFile(inboxPath, JSON.stringify(messages, null, 2), "utf-8");
}

async function getTrafficCollection() {
  if (!mongoUri) {
    return null;
  }

  if (!trafficCollectionPromise) {
    trafficCollectionPromise = (async () => {
      const client = new MongoClient(mongoUri, {
        connectTimeoutMS: 8000,
        serverSelectionTimeoutMS: 8000,
      });
      await client.connect();
      const collection = client.db(mongoDatabaseName).collection(trafficCollectionName);
      await collection.createIndex({ timestamp: -1 });
      await collection.createIndex({ day: -1 });
      await collection.createIndex({ path: 1, timestamp: -1 });
      return collection;
    })().catch((error) => {
      trafficCollectionPromise = undefined;
      throw error;
    });
  }

  return trafficCollectionPromise;
}

function getKoreanDay(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "00";
  const day = parts.find((part) => part.type === "day")?.value || "00";
  return `${year}-${month}-${day}`;
}

function addDaysToDay(day, offset) {
  const [year, month, date] = String(day || "").split("-").map(Number);
  const utc = new Date(Date.UTC(year || 1970, (month || 1) - 1, date || 1));
  utc.setUTCDate(utc.getUTCDate() + offset);
  return utc.toISOString().slice(0, 10);
}

function hashTrafficValue(value) {
  const normalized = String(value || "unknown").trim() || "unknown";
  return createHmac("sha256", trafficHashSecret).update(normalized).digest("hex").slice(0, 24);
}

function getClientIp(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.socket.remoteAddress || "unknown";
}

function getDeviceType(userAgent) {
  const ua = String(userAgent || "").toLowerCase();
  if (/ipad|tablet/.test(ua)) return "tablet";
  if (/android|iphone|ipod|blackberry|iemobile|opera mini|mobile/.test(ua)) return "mobile";
  return "desktop";
}

function getBrowserName(userAgent) {
  const ua = String(userAgent || "");
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome\//.test(ua) && !/Chromium\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "Safari";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Instagram/.test(ua)) return "Instagram";
  return "Other";
}

function isLikelyBot(userAgent) {
  return /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|uptime|monitor/i.test(String(userAgent || ""));
}

function shouldTrackTraffic(request, pathname, safeRelativePath, extension) {
  if (request.method !== "GET") return false;
  if (extension !== ".html") return false;
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/assets/") || pathname.startsWith("/chrome-extension/")) return false;
  if (pathname.startsWith("/.well-known/")) return false;
  if (isLikelyBot(request.headers["user-agent"])) return false;
  return Boolean(safeRelativePath && safeRelativePath.endsWith(".html"));
}

function createTrafficEvent(request, requestUrl) {
  const now = new Date();
  const userAgent = String(request.headers["user-agent"] || "");
  const referrer = String(request.headers.referer || request.headers.referrer || "").slice(0, 500);
  const pathname = requestUrl.pathname || "/";
  const search = requestUrl.search || "";
  return {
    id: `${now.getTime()}-${randomBytes(5).toString("hex")}`,
    timestamp: now.toISOString(),
    day: getKoreanDay(now),
    path: pathname,
    query: search,
    page: pathname,
    referrer,
    device: getDeviceType(userAgent),
    browser: getBrowserName(userAgent),
    visitorId: hashTrafficValue(`${getClientIp(request)}|${userAgent}`),
  };
}

async function saveTrafficEvent(event) {
  const collection = await getTrafficCollection();
  if (collection) {
    await collection.insertOne(event);
    return;
  }

  let events = [];
  try {
    const data = await readFile(trafficPath, "utf-8");
    const parsed = JSON.parse(data);
    events = Array.isArray(parsed) ? parsed : [];
  } catch {
    events = [];
  }

  events.unshift(event);
  const limit = Number.isFinite(maxLocalTrafficEvents) && maxLocalTrafficEvents > 0 ? maxLocalTrafficEvents : 10000;
  await mkdir(dataDir, { recursive: true });
  await writeFile(trafficPath, JSON.stringify(events.slice(0, limit), null, 2), "utf-8");
}

async function readTrafficEvents({ sinceDay, limit = 10000 } = {}) {
  const collection = await getTrafficCollection();
  if (collection) {
    const query = sinceDay ? { day: { $gte: sinceDay } } : {};
    return collection
      .find(query, { projection: { _id: 0 } })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }

  try {
    const data = await readFile(trafficPath, "utf-8");
    const parsed = JSON.parse(data);
    const events = Array.isArray(parsed) ? parsed : [];
    return events
      .filter((event) => !sinceDay || String(event.day || "") >= sinceDay)
      .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")))
      .slice(0, limit);
  } catch {
    return [];
  }
}

function incrementCount(map, key) {
  const normalized = String(key || "Unknown").trim() || "Unknown";
  map.set(normalized, (map.get(normalized) || 0) + 1);
}

function mapToSortedArray(map, limit = 10) {
  return [...map.entries()]
    .map(([label, views]) => ({ label, views }))
    .sort((a, b) => b.views - a.views || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function getReferrerLabel(referrer) {
  if (!referrer) return "Direct / none";
  try {
    const url = new URL(referrer);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "Other";
  }
}

function summarizeTraffic(events) {
  const today = getKoreanDay();
  const yesterday = addDaysToDay(today, -1);
  const sevenDayStart = addDaysToDay(today, -6);
  const thirtyDayStart = addDaysToDay(today, -29);
  const dailyMap = new Map();
  const pageMap = new Map();
  const referrerMap = new Map();
  const deviceMap = new Map();
  const browserMap = new Map();
  const todayVisitors = new Set();
  const sevenDayVisitors = new Set();
  const thirtyDayVisitors = new Set();

  let todayViews = 0;
  let yesterdayViews = 0;
  let sevenDayViews = 0;
  let thirtyDayViews = 0;

  for (let offset = 29; offset >= 0; offset -= 1) {
    dailyMap.set(addDaysToDay(today, -offset), { day: addDaysToDay(today, -offset), views: 0, visitors: new Set() });
  }

  for (const event of events) {
    const day = String(event.day || getKoreanDay(event.timestamp));
    const visitorId = String(event.visitorId || "");
    if (day === today) {
      todayViews += 1;
      if (visitorId) todayVisitors.add(visitorId);
    }
    if (day === yesterday) yesterdayViews += 1;
    if (day >= sevenDayStart) {
      sevenDayViews += 1;
      if (visitorId) sevenDayVisitors.add(visitorId);
    }
    if (day >= thirtyDayStart) {
      thirtyDayViews += 1;
      if (visitorId) thirtyDayVisitors.add(visitorId);
      incrementCount(pageMap, event.page || event.path || "/");
      incrementCount(referrerMap, getReferrerLabel(event.referrer));
      incrementCount(deviceMap, event.device || "unknown");
      incrementCount(browserMap, event.browser || "Other");
    }
    if (dailyMap.has(day)) {
      const daily = dailyMap.get(day);
      daily.views += 1;
      if (visitorId) daily.visitors.add(visitorId);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    range: { today, sevenDayStart, thirtyDayStart },
    totals: {
      todayViews,
      todayVisitors: todayVisitors.size,
      yesterdayViews,
      sevenDayViews,
      sevenDayVisitors: sevenDayVisitors.size,
      thirtyDayViews,
      thirtyDayVisitors: thirtyDayVisitors.size,
    },
    daily: [...dailyMap.values()].map((entry) => ({ day: entry.day, views: entry.views, visitors: entry.visitors.size })),
    topPages: mapToSortedArray(pageMap, 12),
    referrers: mapToSortedArray(referrerMap, 8),
    devices: mapToSortedArray(deviceMap, 6),
    browsers: mapToSortedArray(browserMap, 6),
    recent: events.slice(0, 30).map((event) => ({
      timestamp: event.timestamp,
      day: event.day,
      page: event.page || event.path || "/",
      referrer: getReferrerLabel(event.referrer),
      device: event.device || "unknown",
      browser: event.browser || "Other",
    })),
  };
}

async function upsertInboxRecord(record) {
  const collection = await getInboxCollection();
  if (collection) {
    const existing = await collection.findOne({ id: record.id }, { projection: { _id: 0 } });
    const merged = {
      ...(existing || {}),
      ...record,
      id: record.id,
      createdAt: existing?.createdAt || record.createdAt,
    };
    await collection.replaceOne({ id: record.id }, merged, { upsert: true });
    return merged;
  }

  const messages = await readInbox();
  const index = messages.findIndex((message) => message.id === record.id);
  if (index >= 0) {
    messages[index] = {
      ...messages[index],
      ...record,
      id: record.id,
      createdAt: messages[index].createdAt || record.createdAt,
    };
  } else {
    messages.unshift(record);
  }
  await mkdir(dataDir, { recursive: true });
  await writeFile(inboxPath, JSON.stringify(messages, null, 2), "utf-8");
  return index >= 0 ? messages[index] : record;
}

async function deleteInboxRecord(id) {
  const collection = await getInboxCollection();
  if (collection) {
    const result = await collection.deleteOne({ id });
    return result.deletedCount > 0;
  }
  const messages = await readInbox();
  const filtered = messages.filter((m) => m.id !== id);
  if (filtered.length === messages.length) return false;
  await mkdir(dataDir, { recursive: true });
  await writeFile(inboxPath, JSON.stringify(filtered, null, 2), "utf-8");
  return true;
}

async function getPatientsCollection() {
  if (!mongoUri) return null;
  if (!patientsCollectionPromise) {
    patientsCollectionPromise = (async () => {
      const client = new MongoClient(mongoUri, { connectTimeoutMS: 8000, serverSelectionTimeoutMS: 8000 });
      await client.connect();
      const col = client.db(mongoDatabaseName).collection(patientsCollectionName);
      await col.createIndex({ email: 1 }, { unique: true });
      return col;
    })().catch((error) => { patientsCollectionPromise = undefined; throw error; });
  }
  return patientsCollectionPromise;
}

async function getEmailThreadsCollection() {
  if (!mongoUri) return null;
  if (!emailThreadsCollectionPromise) {
    emailThreadsCollectionPromise = (async () => {
      const client = new MongoClient(mongoUri, { connectTimeoutMS: 8000, serverSelectionTimeoutMS: 8000 });
      await client.connect();
      const col = client.db(mongoDatabaseName).collection(emailThreadsCollectionName);
      await col.createIndex({ email: 1 });
      await col.createIndex({ reservationId: 1 });
      return col;
    })().catch((error) => { emailThreadsCollectionPromise = undefined; throw error; });
  }
  return emailThreadsCollectionPromise;
}

async function readEmailThreads() {
  const collection = await getEmailThreadsCollection();
  if (collection) {
    return collection.find({}, { projection: { _id: 0 } }).sort({ updatedAt: -1 }).limit(1000).toArray();
  }
  try {
    const data = await readFile(emailThreadsPath, "utf-8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

async function deleteEmailThread(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return false;
  const collection = await getEmailThreadsCollection();
  if (collection) {
    const result = await collection.deleteOne({ email: normalizedEmail });
    return result.deletedCount > 0;
  }

  const threads = await readEmailThreads();
  const filtered = threads.filter((thread) => String(thread.email || "").toLowerCase() !== normalizedEmail);
  if (filtered.length === threads.length) return false;
  await mkdir(dataDir, { recursive: true });
  await writeFile(emailThreadsPath, JSON.stringify(filtered, null, 2), "utf-8");
  return true;
}

async function deleteEmailThreadMessage(email, messageIndex) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const index = Number(messageIndex);
  if (!normalizedEmail || !Number.isInteger(index) || index < 0) return { deleted: false, thread: [] };
  const collection = await getEmailThreadsCollection();

  if (collection) {
    const thread = await collection.findOne({ email: normalizedEmail }, { projection: { _id: 0 } });
    const messages = Array.isArray(thread?.messages) ? thread.messages : [];
    if (!thread || index >= messages.length) return { deleted: false, thread: messages };
    const nextMessages = messages.filter((_, currentIndex) => currentIndex !== index);
    if (nextMessages.length) await collection.updateOne({ email: normalizedEmail }, { $set: { messages: nextMessages, updatedAt: new Date().toISOString() } });
    else await collection.deleteOne({ email: normalizedEmail });
    return { deleted: true, thread: nextMessages };
  }

  const threads = await readEmailThreads();
  const threadIndex = threads.findIndex((thread) => String(thread.email || "").toLowerCase() === normalizedEmail);
  if (threadIndex < 0) return { deleted: false, thread: [] };
  const messages = Array.isArray(threads[threadIndex].messages) ? threads[threadIndex].messages : [];
  if (index >= messages.length) return { deleted: false, thread: messages };
  const nextMessages = messages.filter((_, currentIndex) => currentIndex !== index);
  if (nextMessages.length) {
    threads[threadIndex].messages = nextMessages;
    threads[threadIndex].updatedAt = new Date().toISOString();
  } else {
    threads.splice(threadIndex, 1);
  }
  await mkdir(dataDir, { recursive: true });
  await writeFile(emailThreadsPath, JSON.stringify(threads, null, 2), "utf-8");
  return { deleted: true, thread: nextMessages };
}

async function saveOrUpdateEmailThread(email, reservationId, messageData) {
  const now = new Date().toISOString();
  const collection = await getEmailThreadsCollection();
  const message = { ...messageData };
  if (!message.channel) {
    const source = String(message.source || "").toLowerCase();
    if (source === "consult-chat" || source === "web") message.channel = "web";
    else if (source === "instagram" || source === "instagram-dm" || source === "instagram_dm") message.channel = "instagram";
    else message.channel = "email";
  }
  
  if (collection) {
    if (message.messageId) {
      const existing = await collection.findOne({ email, "messages.messageId": message.messageId }, { projection: { _id: 1 } });
      if (existing) return;
    }
    // Note: $setOnInsert and $push cannot target the same field ("messages").
    // Use $setOnInsert only for non-array fields; $push handles the array for both insert and update.
    await collection.updateOne(
      { email },
      {
        $set: { email, reservationId, updatedAt: now },
        $setOnInsert: { id: `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: now },
        $push: { messages: message },
      },
      { upsert: true }
    );
    return;
  }

  const threads = await readEmailThreads();
  const idx = threads.findIndex((t) => t.email === email);
  if (idx >= 0) {
    if (message.messageId && Array.isArray(threads[idx].messages) && threads[idx].messages.some((item) => item.messageId === message.messageId)) return;
    threads[idx].messages.push(message);
    threads[idx].updatedAt = now;
  } else {
    threads.unshift({
      id: `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      email,
      reservationId,
      messages: [message],
      createdAt: now,
      updatedAt: now,
    });
  }
  await mkdir(dataDir, { recursive: true });
  await writeFile(emailThreadsPath, JSON.stringify(threads, null, 2), "utf-8");
}

function getStoredMessageChannel(message) {
  const channel = String(message?.channel || "").toLowerCase();
  if (channel === "web") return "web";
  if (channel === "instagram" || channel === "instagram-dm" || channel === "instagram_dm") return "instagram";
  if (channel === "email") return "email";
  const source = String(message?.source || "").toLowerCase();
  if (source === "consult-chat" || source === "web") return "web";
  if (source === "instagram" || source === "instagram-dm" || source === "instagram_dm") return "instagram";
  return "email";
}

async function markEmailThreadMessagesRead(email, channel = "web") {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedChannel = String(channel || "web").trim().toLowerCase();
  const now = new Date().toISOString();
  const collection = await getEmailThreadsCollection();

  if (collection) {
    const thread = await collection.findOne({ email: normalizedEmail }, { projection: { _id: 0 } });
    if (!thread) return { thread: [], changed: false };
    let changed = false;
    const messages = Array.isArray(thread.messages) ? thread.messages.map((message) => {
      if (message?.type === "customer-reply" && getStoredMessageChannel(message) === normalizedChannel && !message.adminReadAt) {
        changed = true;
        return { ...message, adminReadAt: now };
      }
      return message;
    }) : [];
    if (changed) await collection.updateOne({ email: normalizedEmail }, { $set: { messages } });
    return { thread: messages, changed };
  }

  const threads = await readEmailThreads();
  const index = threads.findIndex((thread) => String(thread.email || "").toLowerCase() === normalizedEmail);
  if (index < 0) return { thread: [], changed: false };
  let changed = false;
  const messages = Array.isArray(threads[index].messages) ? threads[index].messages.map((message) => {
    if (message?.type === "customer-reply" && getStoredMessageChannel(message) === normalizedChannel && !message.adminReadAt) {
      changed = true;
      return { ...message, adminReadAt: now };
    }
    return message;
  }) : [];
  if (changed) {
    threads[index].messages = messages;
    await mkdir(dataDir, { recursive: true });
    await writeFile(emailThreadsPath, JSON.stringify(threads, null, 2), "utf-8");
  }
  return { thread: messages, changed };
}

function patientLatestInputTime(patient) {
  const candidates = [
    patient?.latestReservation?.updatedAt,
    patient?.latestReservation?.createdAt,
    patient?.updatedAt,
    patient?.firstSeen,
  ];
  if (Array.isArray(patient?.reservations)) {
    for (const reservation of patient.reservations) {
      candidates.push(reservation?.updatedAt, reservation?.createdAt);
    }
  }
  return Math.max(0, ...candidates.map((value) => {
    const time = new Date(value || 0).getTime();
    return Number.isFinite(time) ? time : 0;
  }));
}

function sortPatientsByLatestInput(patients) {
  return [...patients].sort((a, b) => patientLatestInputTime(b) - patientLatestInputTime(a));
}

function normalizePatientEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePatientPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("820")) return `0${digits.slice(3)}`;
  if (digits.startsWith("82") && digits.length >= 10) return `0${digits.slice(2)}`;
  return digits;
}

function getPatientEmailKeys(patient) {
  const keys = new Set();
  [patient?.email, patient?.realEmail, patient?.latestReservation?.email].forEach((value) => {
    const email = normalizePatientEmail(value);
    if (email) keys.add(email);
  });
  if (Array.isArray(patient?.reservations)) {
    patient.reservations.forEach((reservation) => {
      const email = normalizePatientEmail(reservation?.email);
      if (email) keys.add(email);
    });
  }
  if (Array.isArray(patient?.threadEmails)) {
    patient.threadEmails.forEach((value) => {
      const email = normalizePatientEmail(value);
      if (email) keys.add(email);
    });
  }
  return keys;
}

function findMatchingPatientIndexes(patients, { email, realEmail, phone }) {
  const targetEmails = [email, realEmail].map(normalizePatientEmail).filter(Boolean);
  const targetPhone = normalizePatientPhone(phone);
  const matches = [];

  patients.forEach((patient, index) => {
    const emailKeys = getPatientEmailKeys(patient);
    const emailMatches = targetEmails.some((value) => emailKeys.has(value));
    const phoneMatches = targetPhone && normalizePatientPhone(patient?.phone) === targetPhone;
    if (emailMatches || phoneMatches) matches.push(index);
  });

  return matches;
}

function mergeUniqueById(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter((item) => {
    const key = String(item?.id || JSON.stringify(item));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergePatientRecords(records) {
  const validRecords = records.filter(Boolean);
  const now = new Date().toISOString();
  const merged = validRecords.reduce((result, patient) => {
    const firstSeenTime = new Date(patient.firstSeen || result.firstSeen || now).getTime();
    const resultFirstSeenTime = new Date(result.firstSeen || now).getTime();
    const reservations = mergeUniqueById([...(result.reservations || []), ...(patient.reservations || [])]);
    const reservationIds = [...new Set([...(result.reservationIds || []), ...(patient.reservationIds || [])].filter(Boolean))];
    const threadEmails = [...new Set([...(result.threadEmails || []), ...Array.from(getPatientEmailKeys(patient))].filter(Boolean))];
    const latestReservation = [result.latestReservation, patient.latestReservation, ...reservations]
      .filter(Boolean)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))[0] || null;

    return {
      ...result,
      ...patient,
      id: result.id || patient.id || `patient-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      email: result.email || patient.email,
      realEmail: result.realEmail || patient.realEmail || null,
      name: result.name || patient.name || null,
      phone: result.phone || patient.phone || null,
      firstSeen: firstSeenTime < resultFirstSeenTime ? patient.firstSeen : (result.firstSeen || patient.firstSeen || now),
      updatedAt: new Date(Math.max(new Date(result.updatedAt || 0).getTime(), new Date(patient.updatedAt || 0).getTime(), Date.now())).toISOString(),
      latestReservation,
      reservationIds,
      reservations,
      threadEmails,
    };
  }, {});

  return Object.keys(merged).length ? merged : null;
}

function getPatientThreadEmail(record) {
  const email = String(record?.email || record?.threadEmail || "").trim().toLowerCase();
  if (email) return email;
  const id = String(record?.id || `manual-${Date.now()}`).trim().toLowerCase().replace(/[^a-z0-9-]/g, "") || `manual-${Date.now()}`;
  return `${id}@schedule.lofi.internal`;
}

function normalizeChatToken(value, maxLength = 80) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, maxLength);
}

function getRequestIp(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const realIp = String(request.headers["x-real-ip"] || "").trim();
  const remoteAddress = String(request.socket?.remoteAddress || "").trim();
  return (forwarded || realIp || remoteAddress).replace(/^::ffff:/, "").slice(0, 80);
}

async function findConsultChatRecord({ sessionId, deviceId, clientIp }) {
  const inbox = await readInbox();
  const matches = inbox.filter((record) => {
    if (record?.source !== "consult-chat") return false;
    if (sessionId && (record.chatSessionId === sessionId || record.id === sessionId)) return true;
    if (deviceId && record.chatDeviceId === deviceId) return true;
    if (!sessionId && !deviceId && clientIp && record.clientIp === clientIp) return true;
    return false;
  });

  return matches.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))[0] || null;
}

async function getConsultThread(record) {
  if (!record?.email) return [];
  const threads = await readEmailThreads();
  const thread = threads.find((item) => item.email && item.email.toLowerCase() === record.email.toLowerCase());
  return Array.isArray(thread?.messages) ? thread.messages : [];
}

function normalizeConsultAttachments(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 1).flatMap((attachment) => {
    const name = String(attachment?.name || "photo.jpg").replace(/[\\/]/g, "").slice(0, 80) || "photo.jpg";
    const type = String(attachment?.type || "").toLowerCase();
    const dataUrl = String(attachment?.dataUrl || "");

    if (!type.startsWith("image/") || !dataUrl.startsWith("data:image/") || dataUrl.length > 900000) {
      return [];
    }

    return [{ name, type, dataUrl }];
  });
}

async function readPatients() {
  const collection = await getPatientsCollection();
  if (collection) {
    return collection.find({}, { projection: { _id: 0 } }).sort({ updatedAt: -1 }).limit(1000).toArray();
  }
  try {
    const data = await readFile(patientsPath, "utf-8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

async function writePatients(patients) {
  const collection = await getPatientsCollection();
  if (collection) {
    await collection.deleteMany({});
    if (patients.length) await collection.insertMany(patients);
    return;
  }
  await mkdir(dataDir, { recursive: true });
  await writeFile(patientsPath, JSON.stringify(patients, null, 2), "utf-8");
}

async function updatePatientName(email, name) {
  const normalizedEmail = normalizePatientEmail(email);
  const nextName = String(name || "").trim().slice(0, 80);
  if (!normalizedEmail || !nextName) return null;
  const patients = await readPatients();
  const index = patients.findIndex((patient) => getPatientEmailKeys(patient).has(normalizedEmail));
  if (index < 0) return null;
  patients[index] = { ...patients[index], name: nextName, updatedAt: new Date().toISOString() };
  await writePatients(patients);
  return patients[index];
}

async function deletePatientRecord(email) {
  const normalizedEmail = normalizePatientEmail(email);
  if (!normalizedEmail) return { deleted: false, removedReservations: 0, removedThread: false };
  const collection = await getPatientsCollection();
  let patient = null;
  let deleted = false;

  if (collection) {
    const query = {
      $or: [
        { email: normalizedEmail },
        { realEmail: normalizedEmail },
        { threadEmails: normalizedEmail },
        { "latestReservation.email": normalizedEmail },
        { "reservations.email": normalizedEmail },
      ],
    };
    patient = await collection.findOne(query, { projection: { _id: 0 } });
    const result = await collection.deleteOne(query);
    deleted = result.deletedCount > 0;
  } else {
    const patients = await readPatients();
    const index = patients.findIndex((item) => getPatientEmailKeys(item).has(normalizedEmail));
    if (index >= 0) {
      patient = patients[index];
      patients.splice(index, 1);
      await mkdir(dataDir, { recursive: true });
      await writeFile(patientsPath, JSON.stringify(patients, null, 2), "utf-8");
      deleted = true;
    }
  }

  const reservationIds = Array.isArray(patient?.reservationIds) ? patient.reservationIds.filter(Boolean) : [];
  let removedReservations = 0;
  for (const id of reservationIds) {
    if (await deleteInboxRecord(id)) removedReservations += 1;
  }
  const threadEmails = [...new Set([normalizedEmail, ...Array.from(getPatientEmailKeys(patient || {}))].filter(Boolean))];
  let removedThread = false;
  for (const threadEmail of threadEmails) {
    if (await deleteEmailThread(threadEmail)) removedThread = true;
  }
  return { deleted, removedReservations, removedThread };
}

function extractPatientInfo(text) {
  const result = { name: null, phone: null };
  const namePatterns = [
    /(?:이름|성함)\s*[:：]\s*(.+)/i,
    /(?:제\s*이름은|저는|나는)\s*([^\n,.。!?]{2,30})(?:입니다|이에요|예요|라고\s*합니다)/i,
    /name\s*[:：]\s*(.+)/i,
    /my\s+name\s+is\s+([^\n,.!?]{2,50})/i,
  ];
  const phonePatterns = [
    /(?:전화|연락처|휴대폰|핸드폰)\s*번?호?\s*[:：]\s*([\d\s\-+().]+)/i,
    /phone\s*(?:number)?\s*[:：]\s*([\d\s\-+().]+)/i,
    /((?:\+?82|0)\d[\d\s\-]{7,14}\d)/,
  ];
  for (const p of namePatterns) {
    const m = text.match(p);
    if (m) { result.name = m[1].trim().split(/\n/)[0].replace(/(?:입니다|이에요|예요|라고\s*합니다)$/i, "").trim().slice(0, 80); break; }
  }
  for (const p of phonePatterns) {
    const m = text.match(p);
    if (m) { result.phone = m[1].trim().replace(/\s+/g, "-").slice(0, 30); break; }
  }
  return result;
}

async function saveOrUpdatePatient(record, patientInfo) {
  const realEmail = record.email && !String(record.email).endsWith(".lofi.internal") ? record.email : null;
  if (!patientInfo.name && !patientInfo.phone && !record.name && !record.phone && !realEmail) return;
  const now = new Date().toISOString();
  const recordTime = record.updatedAt || record.createdAt || now;
  const email = getPatientThreadEmail(record);
  const name = patientInfo.name || record.name || null;
  const phone = patientInfo.phone || record.phone || null;
  const reservation = {
    id: record.id,
    date: record.date || null,
    time: record.time || null,
    email: realEmail || record.email || null,
    concerns: record.concerns || null,
    source: record.source || "reservation",
    createdAt: record.createdAt || now,
  };
  const latestReservation = {
    ...reservation,
    updatedAt: recordTime,
  };
  const patients = await readPatients();
  const incoming = {
    id: `patient-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    email,
    realEmail,
    name,
    phone,
    firstSeen: now,
    updatedAt: recordTime,
    latestReservation,
    reservationIds: [record.id],
    reservations: [reservation],
    threadEmails: [email, realEmail].filter(Boolean).map(normalizePatientEmail),
  };
  const matchedIndexes = findMatchingPatientIndexes(patients, { email, realEmail, phone });
  const matchedPatients = matchedIndexes.map((index) => patients[index]);
  const merged = mergePatientRecords([...matchedPatients, incoming]);
  const filtered = patients.filter((_, index) => !matchedIndexes.includes(index));
  filtered.unshift(merged);
  await writePatients(filtered);
}

async function syncInboxReservationsToPatients() {
  const inbox = await readInbox();

  for (const record of inbox) {
    try {
      const patientInfo = extractPatientInfo(record.concerns || "");
      await saveOrUpdatePatient(record, patientInfo);
    } catch (error) {
      console.error("Failed to sync reservation to patients", { id: record?.id, error });
    }
  }
}

async function saveInstagramDmMessage(senderId, content, receivedAt = new Date().toISOString()) {
  const normalizedSenderId = String(senderId || "").trim();
  const text = String(content || "").trim();
  if (!normalizedSenderId || !text) return null;

  const id = `instagram-${normalizedSenderId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const email = `${id.toLowerCase()}@instagram.lofi.internal`;
  const existingRecord = (await readInbox()).find((record) => record.id === id || String(record.email || "").toLowerCase() === email);
  const patientInfo = extractPatientInfo(text);
  const name = patientInfo.name || existingRecord?.name || `Instagram ${normalizedSenderId.slice(-6)}`;
  const record = {
    id,
    date: "Instagram DM",
    time: "Live",
    email,
    name,
    concerns: text,
    source: "instagram-dm",
    channel: "instagram",
    instagramSenderId: normalizedSenderId,
    createdAt: existingRecord?.createdAt || receivedAt,
    updatedAt: receivedAt,
  };

  if (patientInfo.phone || existingRecord?.phone) {
    record.phone = patientInfo.phone || existingRecord.phone;
  }

  const savedRecord = await upsertInboxRecord(record);
  await saveOrUpdateEmailThread(email, id, {
    type: "customer-reply",
    receivedAt,
    content: text,
    source: "instagram-dm",
    channel: "instagram",
    instagramSenderId: normalizedSenderId,
  });
  await saveOrUpdatePatient(savedRecord, { name, phone: record.phone || null });
  return savedRecord;
}

async function instagramDmContentExists(senderId, content) {
  const normalizedSenderId = String(senderId || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
  const text = String(content || "").trim();
  if (!normalizedSenderId || !text) return false;

  const email = `instagram-${normalizedSenderId.toLowerCase()}@instagram.lofi.internal`;
  const threads = await readEmailThreads();
  const thread = threads.find((item) => String(item.email || "").toLowerCase() === email);
  return Array.isArray(thread?.messages) && thread.messages.some((message) => String(message.content || "").trim() === text);
}

async function sendInstagramDmReply(senderId, content) {
  const config = await getInstagramMessagingConfig();
  if (!config.businessAccountId || !config.accessToken) {
    throw new Error("Instagram messaging is not configured");
  }

  const endpoint = `https://graph.instagram.com/${config.graphApiVersion}/${encodeURIComponent(config.businessAccountId)}/messages`;
  const apiResponse = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: senderId },
      message: { text: content },
    }),
  });

  const data = await apiResponse.json().catch(() => ({}));
  if (!apiResponse.ok) {
    const message = data?.error?.message || "Failed to send Instagram reply";
    const error = new Error(message);
    error.statusCode = apiResponse.status;
    throw error;
  }

  return data;
}

function isLocalImporterHost(requestHost) {
  return ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(requestHost);
}

function isValidInstagramExtensionImporter(request) {
  const token = String(request.headers["x-lofi-instagram-importer"] || "");
  return token && token === instagramExtensionImportToken;
}

async function importInstagramExtensionConversations(request, response) {
  try {
    const payload = await getJsonBody(request);
    const conversations = Array.isArray(payload.conversations) ? payload.conversations : [];
    if (!conversations.length) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "No Instagram conversations were provided" }));
      return;
    }

    const limitedConversations = conversations.slice(0, 120);
    let savedCount = 0;
    let skippedCount = 0;

    for (const conversation of limitedConversations) {
      const senderId = String(conversation.senderId || conversation.threadId || conversation.url || "").trim();
      const title = String(conversation.title || "").trim();
      const url = String(conversation.url || "").trim();
      const capturedAt = String(conversation.capturedAt || "").trim() || new Date().toISOString();
      const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
      const messageText = messages
        .map((message) => {
          const author = String(message.author || "").trim();
          const text = String(message.text || "").trim();
          return text ? `${author ? `${author}: ` : ""}${text}` : "";
        })
        .filter(Boolean)
        .join("\n");
      const fallbackText = String(conversation.text || "").trim();
      const content = [
        "Imported from Instagram Chrome Extension.",
        title ? `Conversation: ${title}` : "",
        url ? `URL: ${url}` : "",
        messageText || fallbackText,
      ].filter(Boolean).join("\n\n").trim().slice(0, 20000);

      if (!senderId || !content || content.length < 20) {
        skippedCount += 1;
        continue;
      }

      if (await instagramDmContentExists(senderId, content)) {
        skippedCount += 1;
        continue;
      }

      const saved = await saveInstagramDmMessage(senderId, content, capturedAt);
      if (saved) savedCount += 1;
      else skippedCount += 1;
    }

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, savedCount, skippedCount }));
  } catch (error) {
    console.error("Failed to import Instagram extension conversations", error);
    const isPayloadError = error instanceof Error && ["Invalid JSON", "Payload too large"].includes(error.message);
    response.writeHead(isPayloadError ? 400 : 500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ message: isPayloadError ? "Invalid request" : "Failed to import Instagram extension conversations" }));
  }
}

async function readInstagramSettings() {
  try {
    const data = await readFile(instagramSettingsPath, "utf-8");
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function saveInstagramSettings(settings) {
  const saved = {
    instagramUsername: String(settings.instagramUsername || "").trim().replace(/^@+/, ""),
    businessAccountId: String(settings.businessAccountId || "").trim(),
    accessToken: String(settings.accessToken || "").trim(),
    graphApiVersion: String(settings.graphApiVersion || instagramGraphApiVersion).trim() || instagramGraphApiVersion,
    updatedAt: new Date().toISOString(),
  };
  await mkdir(dataDir, { recursive: true });
  await writeFile(instagramSettingsPath, JSON.stringify(saved, null, 2), "utf-8");
  return saved;
}

async function getInstagramMessagingConfig() {
  const saved = await readInstagramSettings();
  return {
    instagramUsername: String(saved.instagramUsername || "").trim().replace(/^@+/, ""),
    businessAccountId: String(saved.businessAccountId || instagramBusinessAccountId || "").trim(),
    accessToken: String(saved.accessToken || instagramAccessToken || "").trim(),
    graphApiVersion: String(saved.graphApiVersion || instagramGraphApiVersion || "v21.0").trim(),
  };
}

function publicInstagramSettings(config) {
  return {
    instagramUsername: config.instagramUsername || "",
    businessAccountId: config.businessAccountId || "",
    graphApiVersion: config.graphApiVersion || instagramGraphApiVersion,
    accessTokenConfigured: Boolean(config.accessToken),
    renderServiceIdDefault: renderDefaultServiceId,
    renderApiKeyConfigured: Boolean(renderApiKey),
  };
}

async function upsertRenderEnvVar(serviceId, apiKey, key, value) {
  const baseUrl = `https://api.render.com/v1/services/${encodeURIComponent(serviceId)}/env-vars`;
  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Accept": "application/json",
    "Content-Type": "application/json",
  };
  const updateResponse = await fetch(`${baseUrl}/${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ value }),
  });
  if (updateResponse.ok) return { key, action: "updated" };

  if (updateResponse.status !== 404) {
    const body = await updateResponse.text().catch(() => "");
    throw new Error(`Render env update failed for ${key}: ${body || updateResponse.status}`);
  }

  const createResponse = await fetch(baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ key, value }),
  });
  if (createResponse.ok) return { key, action: "created" };

  const body = await createResponse.text().catch(() => "");
  throw new Error(`Render env create failed for ${key}: ${body || createResponse.status}`);
}

async function syncInstagramSettingsToRender({ serviceId, apiKey, settings, triggerDeploy }) {
  const results = [];
  results.push(await upsertRenderEnvVar(serviceId, apiKey, "INSTAGRAM_BUSINESS_ACCOUNT_ID", settings.businessAccountId));
  results.push(await upsertRenderEnvVar(serviceId, apiKey, "INSTAGRAM_ACCESS_TOKEN", settings.accessToken));
  results.push(await upsertRenderEnvVar(serviceId, apiKey, "INSTAGRAM_GRAPH_API_VERSION", settings.graphApiVersion));

  let deploy = null;
  if (triggerDeploy) {
    const deployResponse = await fetch(`https://api.render.com/v1/services/${encodeURIComponent(serviceId)}/deploys`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ clearCache: "do_not_clear" }),
    });
    if (!deployResponse.ok) {
      const body = await deployResponse.text().catch(() => "");
      throw new Error(`Render deploy trigger failed: ${body || deployResponse.status}`);
    }
    deploy = await deployResponse.json().catch(() => ({ ok: true }));
  }

  return { results, deploy };
}

function getJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Payload too large"));
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });

    request.on("error", () => reject(new Error("Request failed")));
  });
}

function getRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error("Payload too large"));
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", () => reject(new Error("Request failed")));
  });
}

function isValidMetaSignature(rawBody, signatureHeader) {
  if (!instagramClientSecret) return true;
  const signature = String(signatureHeader || "").trim();
  if (!signature.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", instagramClientSecret).update(rawBody).digest("hex");
  const received = signature.slice("sha256=".length);
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function isAuthorized(request) {
  const authHeader = request.headers.authorization || "";
  if (!authHeader.startsWith("Basic ")) {
    return false;
  }

  const encoded = authHeader.slice(6);
  let decoded;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf-8");
  } catch {
    return false;
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex < 0) {
    return false;
  }

  const user = decoded.slice(0, separatorIndex);
  const pass = decoded.slice(separatorIndex + 1);
  return user === adminUser && pass === adminPass;
}

function hasAdminSession(request) {
  const cookieHeader = request.headers.cookie || "";
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .includes(`${adminSessionCookie}=${adminSessionValue}`);
}

function requestAuth(response) {
  response.writeHead(401, {
    "Content-Type": "application/json; charset=utf-8",
    "WWW-Authenticate": 'Basic realm="Admin Messages"',
  });
  response.end(JSON.stringify({ message: "Unauthorized" }));
}

function isInstagramLoginConfigured() {
  return Boolean(instagramClientId && instagramClientSecret && (instagramAdminUsers.length || instagramAdminIds.length));
}

function getRequestOrigin(request) {
  const proto = String(request.headers["x-forwarded-proto"] || "http").split(",")[0].trim() || "http";
  const host = String(request.headers["x-forwarded-host"] || request.headers.host || `localhost:${port}`).split(",")[0].trim();
  return `${proto}://${host}`;
}

function getInstagramRedirectUri(request) {
  return instagramRedirectUri || `${getRequestOrigin(request)}/api/admin/instagram-callback`;
}

function cleanupInstagramAuthStates() {
  const now = Date.now();
  for (const [state, entry] of instagramAuthStates.entries()) {
    if (entry.expiresAt <= now) {
      instagramAuthStates.delete(state);
    }
  }
}

function createInstagramAuthState(nextPath) {
  cleanupInstagramAuthStates();
  const state = randomBytes(18).toString("base64url");
  instagramAuthStates.set(state, {
    next: nextPath && nextPath.startsWith("/") ? nextPath : "/admin",
    expiresAt: Date.now() + instagramAuthStateTtlMs,
  });
  return state;
}

function consumeInstagramAuthState(state) {
  cleanupInstagramAuthStates();
  const entry = instagramAuthStates.get(state);
  instagramAuthStates.delete(state);
  return entry || null;
}

async function exchangeInstagramCodeForToken(code, redirectUri) {
  const body = new URLSearchParams({
    client_id: instagramClientId,
    client_secret: instagramClientSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const tokenResponse = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_message || "Instagram token exchange failed");
  }

  return tokenData.access_token;
}

async function getInstagramProfile(accessToken) {
  const profileUrl = new URL("https://graph.instagram.com/me");
  profileUrl.searchParams.set("fields", "id,username");
  profileUrl.searchParams.set("access_token", accessToken);

  const profileResponse = await fetch(profileUrl);
  const profile = await profileResponse.json().catch(() => ({}));
  if (!profileResponse.ok || !profile.id) {
    throw new Error(profile.error?.message || "Instagram profile lookup failed");
  }

  return profile;
}

function isAllowedInstagramAdmin(profile) {
  const username = String(profile.username || "").trim().toLowerCase();
  const id = String(profile.id || "").trim();
  return (username && instagramAdminUsers.includes(username)) || (id && instagramAdminIds.includes(id));
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function hasMailExchange(email) {
  const domain = email.split("@").pop();
  if (!domain) {
    return false;
  }

  try {
    const records = await emailResolver.resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}

function cleanupEmailVerificationCodes() {
  const now = Date.now();
  for (const [email, entry] of emailVerificationCodes.entries()) {
    if (entry.expiresAt <= now) {
      emailVerificationCodes.delete(email);
    }
  }

  for (const [email, expiresAt] of verifiedEmails.entries()) {
    if (expiresAt <= now) {
      verifiedEmails.delete(email);
    }
  }
}

function createEmailVerificationCode(email) {
  cleanupEmailVerificationCodes();
  const code = String(randomInt(100000, 1000000));
  emailVerificationCodes.set(email, {
    code,
    expiresAt: Date.now() + emailVerificationTtlMs,
  });
  verifiedEmails.delete(email);
  return code;
}

function removeEmailVerificationCode(email) {
  emailVerificationCodes.delete(email);
}

function isValidEmailVerificationCode(email, code) {
  cleanupEmailVerificationCodes();
  const entry = emailVerificationCodes.get(email);
  if (!entry || entry.code !== code) {
    return false;
  }

  emailVerificationCodes.delete(email);
  return true;
}

function verifyEmailCode(email, code) {
  if (!isValidEmailVerificationCode(email, code)) {
    return false;
  }

  verifiedEmails.set(email, Date.now() + emailVerificationTtlMs);
  return true;
}

function isEmailVerified(email) {
  cleanupEmailVerificationCodes();
  return verifiedEmails.has(email);
}

function removeEmailVerification(email) {
  emailVerificationCodes.delete(email);
  verifiedEmails.delete(email);
}

function getMailTransportConfigs() {
  if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
    return [];
  }

  const configs = [{
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
  }];

  if (smtpHost.trim().toLowerCase() === "smtp.gmail.com") {
    const fallbackPort = smtpPort === 465 ? 587 : 465;
    configs.push({
      host: smtpHost,
      port: fallbackPort,
      secure: fallbackPort === 465,
    });
  }

  return configs;
}

function hasResendConfig() {
  return Boolean(resendApiKey && resendFrom);
}

function hasAnyMailConfig() {
  return hasResendConfig() || getMailTransportConfigs().length > 0;
}

function getEmailProviderStatus() {
  const smtpConfigs = getMailTransportConfigs();
  return {
    provider: hasResendConfig() ? "resend" : smtpConfigs.length > 0 ? "smtp" : "none",
    resend: {
      configured: hasResendConfig(),
      apiKeySet: Boolean(resendApiKey),
      fromSet: Boolean(resendFrom),
      from: resendFrom || null,
    },
    smtp: {
      configured: smtpConfigs.length > 0,
      host: smtpHost || null,
      port: smtpPort,
      userSet: Boolean(smtpUser),
      passSet: Boolean(smtpPass),
      fromSet: Boolean(smtpFrom),
      from: smtpFrom || null,
    },
    reservationNotifyToSet: Boolean(reservationNotifyTo),
  };
}

function createMailTransporter(config) {
  return nodemailer.createTransport({
    ...config,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
}

function getSmtpErrorDetails(error) {
  if (!(error instanceof Error)) {
    return { message: "Unknown SMTP error" };
  }

  return {
    code: error.code,
    command: error.command,
    responseCode: error.responseCode,
    message: error.message,
  };
}

async function sendMailWithFallback(mailOptions) {
  if (hasResendConfig()) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: resendFrom,
          to: Array.isArray(mailOptions.to) ? mailOptions.to : [mailOptions.to],
          reply_to: mailOptions.replyTo,
          subject: mailOptions.subject,
          text: mailOptions.text,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Resend API failed with ${response.status}: ${body}`);
      }

      return;
    } catch (error) {
      console.error("Resend send failed", getSmtpErrorDetails(error));
      throw error;
    }
  }

  const configs = getMailTransportConfigs();
  if (configs.length === 0) {
    throw new Error("Email verification is not configured");
  }

  let lastError;
  for (const config of configs) {
    try {
      await createMailTransporter(config).sendMail(mailOptions);
      return;
    } catch (error) {
      lastError = error;
      console.error("SMTP send failed", {
        host: config.host,
        port: config.port,
        secure: config.secure,
        error: getSmtpErrorDetails(error),
      });
    }
  }

  throw lastError || new Error("Failed to send mail");
}

function buildReservationAutoReply(record) {
  const appointmentKst = `${record.date} ${record.time} (KST)`;
  const replyFormUrl = `https://lofiesthetic.com/patient-reply?id=${record.id}`;

  return {
    subject: "Your reservation has been confirmed | lofi dental",
    text: `Hello,

Your reservation for ${appointmentKst} has been confirmed.

Please complete your registration by clicking the link below — it only takes a moment:

${replyFormUrl}

We'll ask for your name, where you're visiting from, and phone number.

See you soon!

lofi esthetic dentistry (lofi dental)
Instagram: www.instagram.com/lofi_esthetic_dentistry
WhatsApp: +82 10-2984-8823`,
  };
}

function buildEmailVerificationMessage(code) {
  return {
    subject: "Your lofi dental reservation code",
    text: `Hello,

Your lofi dental reservation verification code is ${code}.

This code expires in 10 minutes.

lofi dental
49 Apgujeong-ro 28-gil, 3F, Gangnam-gu, Seoul
+82-70-7755-8823`,
  };
}

function buildReservationNotification(record) {
  return {
    subject: `New reservation request: ${record.date} ${record.time}`,
    text: `New reservation request received.

Date: ${record.date}
Time: ${record.time}
Patient email: ${record.email}

Concerns:
${record.concerns}

Received: ${record.createdAt}`,
  };
}

async function sendReservationAutoReply(record) {
  if (!hasAnyMailConfig()) {
    return false;
  }

  const message = buildReservationAutoReply(record);
  await sendMailWithFallback({
    from: smtpFrom,
    to: record.email,
    subject: message.subject,
    text: message.text,
  });
  return true;
}

async function sendReservationNotification(record) {
  if (!hasAnyMailConfig() || !reservationNotifyTo) {
    return false;
  }

  const message = buildReservationNotification(record);
  await sendMailWithFallback({
    from: smtpFrom,
    to: reservationNotifyTo,
    replyTo: record.email,
    subject: message.subject,
    text: message.text,
  });
  return true;
}

function parseEmailAddress(value) {
  const text = String(value || "").trim().toLowerCase();
  const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].toLowerCase() : "";
}

function getAddressEmails(addressField) {
  const values = Array.isArray(addressField?.value) ? addressField.value : [];
  const emails = values.map((item) => parseEmailAddress(item?.address)).filter(Boolean);
  const textEmails = String(addressField?.text || "")
    .split(/[;,]/)
    .map(parseEmailAddress)
    .filter(Boolean);
  return [...new Set([...emails, ...textEmails])];
}

function getClinicEmailSet() {
  return new Set([imapUser, smtpUser, smtpFrom, resendFrom, reservationNotifyTo, "lofidentalcs@lofiesthetic.com"]
    .flatMap((value) => String(value || "").split(/[;,]/))
    .map(parseEmailAddress)
    .filter(Boolean));
}

function isClinicEmail(email) {
  return getClinicEmailSet().has(parseEmailAddress(email));
}

function getMessageIdentity(parsed) {
  return String(parsed.messageId || parsed.headers?.get("message-id") || "").trim().toLowerCase();
}

async function findEmailConversationTarget(parsed) {
  const fromEmails = getAddressEmails(parsed.from);
  const toEmails = [...getAddressEmails(parsed.to), ...getAddressEmails(parsed.cc), ...getAddressEmails(parsed.bcc)];
  const clinicEmails = getClinicEmailSet();
  const inbox = await readInbox();
  const threads = await readEmailThreads();
  const knownEmails = new Set([
    ...inbox.map((record) => normalizePatientEmail(record.email)),
    ...threads.map((thread) => normalizePatientEmail(thread.email)),
  ].filter(Boolean));

  const fromPatient = fromEmails.find((email) => knownEmails.has(email) && !clinicEmails.has(email));
  if (fromPatient) {
    const record = inbox.find((item) => normalizePatientEmail(item.email) === fromPatient);
    const thread = threads.find((item) => normalizePatientEmail(item.email) === fromPatient);
    return { patientEmail: fromPatient, reservationId: record?.id || thread?.reservationId || `email-${Date.now()}`, type: "customer-reply", inboxRecord: record || null };
  }

  const fromClinic = fromEmails.some((email) => clinicEmails.has(email));
  if (fromClinic) {
    const toPatient = toEmails.find((email) => knownEmails.has(email) && !clinicEmails.has(email));
    if (toPatient) {
      const record = inbox.find((item) => normalizePatientEmail(item.email) === toPatient);
      const thread = threads.find((item) => normalizePatientEmail(item.email) === toPatient);
      return { patientEmail: toPatient, reservationId: record?.id || thread?.reservationId || `email-${Date.now()}`, type: "admin-reply", inboxRecord: record || null };
    }
  }

  return null;
}

async function saveParsedEmailToThread(parsed, mailboxName) {
  const text = String(parsed.text || "").trim();
  if (!text) return false;
  const target = await findEmailConversationTarget(parsed);
  if (!target) return false;
  const sentAt = new Date(parsed.date || Date.now()).toISOString();

  if (target.type === "customer-reply" && target.inboxRecord) {
    const patientInfo = extractPatientInfo(text);
    if (patientInfo.name || patientInfo.phone) await saveOrUpdatePatient(target.inboxRecord, patientInfo);
  }

  await saveOrUpdateEmailThread(target.patientEmail, target.reservationId, {
    type: target.type,
    receivedAt: target.type === "customer-reply" ? sentAt : undefined,
    sentAt: target.type === "admin-reply" ? sentAt : undefined,
    content: text.slice(0, 4000),
    subject: String(parsed.subject || "").slice(0, 240),
    messageId: getMessageIdentity(parsed) || undefined,
    mailbox: mailboxName,
    source: "email",
    channel: "email",
  });
  return true;
}

function createImapClient() {
  return new Imap({
    user: imapUser,
    password: imapPass,
    host: imapHost,
    port: imapPort,
    tls: imapPort === 993,
    tlsOptions: { rejectUnauthorized: false },
    connTimeout: 10000,
    authTimeout: 10000,
  });
}

async function fetchAndProcessImapMailbox(imap, mailboxName, criteria, processed, options = {}) {
  return new Promise((resolve) => {
    imap.openBox(mailboxName, false, (err) => {
      if (err) {
        if (!options.optional) console.error(`Failed to open IMAP mailbox ${mailboxName}`, err);
        resolve(0);
        return;
      }

      imap.search(criteria, (searchErr, results) => {
        if (searchErr || !results || results.length === 0) {
          resolve(0);
          return;
        }

        let savedCount = 0;
        const messageTasks = [];
        const fetcher = imap.fetch(results, { bodies: "" });

        fetcher.on("message", (msg, seqno) => {
          const chunks = [];
          let uid = seqno;
          msg.on("body", (stream) => {
            stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          });
          msg.once("attributes", (attrs) => {
            if (attrs?.uid) uid = attrs.uid;
          });
          msg.once("end", () => {
            messageTasks.push((async () => {
              const processedKey = `${mailboxName}:${uid}`;
              if (processed[processedKey]) return;
              try {
                const parsed = await simpleParser(Buffer.concat(chunks));
                const saved = await saveParsedEmailToThread(parsed, mailboxName);
                processed[processedKey] = true;
                if (saved) savedCount += 1;
              } catch (error) {
                console.error(`Failed to process IMAP message from ${mailboxName}`, error);
              }
            })());
          });
        });

        fetcher.on("error", (fetchErr) => {
          console.error(`IMAP fetch error in ${mailboxName}`, fetchErr);
        });

        fetcher.on("end", async () => {
          await Promise.all(messageTasks);
          resolve(savedCount);
        });
      });
    });
  });
}

async function processImapMailboxes({ historical = false } = {}) {
  if (!imapHost || !imapUser || !imapPass) return 0;
  const processed = await readProcessedImapUids();
  let savedCount = 0;

  return new Promise((resolve) => {
    const imap = createImapClient();
    imap.once("ready", async () => {
      try {
        savedCount += await fetchAndProcessImapMailbox(imap, "INBOX", historical ? ["ALL"] : ["UNSEEN"], processed);
        for (const mailbox of imapSentMailboxes) {
          savedCount += await fetchAndProcessImapMailbox(imap, mailbox, ["ALL"], processed, { optional: true });
        }
        await saveProcessedImapUids(processed);
      } catch (error) {
        console.error("Error processing IMAP mailboxes", error);
      } finally {
        imap.end();
        resolve(savedCount);
      }
    });
    imap.once("error", (err) => {
      console.error("IMAP error", err);
      resolve(savedCount);
    });
    imap.connect();
  });
}

async function checkEmailReplies() {
  const savedCount = await processImapMailboxes({ historical: false });
  if (savedCount) console.log(`Saved ${savedCount} email messages from IMAP`);
}

function startEmailReplyChecker() {
  if (!imapHost || !imapUser || !imapPass) {
    console.log("IMAP not configured, email reply checking disabled");
    return;
  }

  console.log("Starting email reply checker...");
  checkEmailReplies().catch((err) => console.error("Initial email check failed", err));

  setInterval(() => {
    checkEmailReplies().catch((err) => console.error("Email check failed", err));
  }, 60000);
}

async function migrateInboxToEmailThreads() {
  try {
    const inbox = await readInbox();
    const existingThreads = await readEmailThreads();
    
    // 이미 스레드로 변환된 이메일 주소들
    const migratedEmails = new Set(existingThreads.map(t => t.email?.toLowerCase()));
    
    // 마이그레이션이 필요한 예약들
    const toMigrate = inbox.filter(reservation => 
      reservation.email && !migratedEmails.has(reservation.email.toLowerCase())
    );
    
    if (toMigrate.length === 0) {
      console.log("No reservations to migrate to email threads");
      return;
    }
    
    console.log(`Migrating ${toMigrate.length} reservations to email threads...`);
    
    for (const reservation of toMigrate) {
      // 예약 요청 메시지 추가
      await saveOrUpdateEmailThread(reservation.email, reservation.id, {
        type: "reservation",
        sentAt: reservation.createdAt,
        date: reservation.date,
        time: reservation.time,
        concerns: reservation.concerns,
        id: reservation.id,
        createdAt: reservation.createdAt,
        source: "email",
        channel: "email",
      });
      
      // 자동 회신 메시지 추가 (과거 데이터이므로 추정)
      const autoReplyMsg = buildReservationAutoReply(reservation);
      await saveOrUpdateEmailThread(reservation.email, reservation.id, {
        type: "auto-reply",
        sentAt: new Date(new Date(reservation.createdAt).getTime() + 10000).toISOString(),
        content: autoReplyMsg.text,
        source: "email",
        channel: "email",
      });
    }
    
    console.log(`Successfully migrated ${toMigrate.length} reservations to email threads`);
  } catch (error) {
    console.error("Migration failed:", error);
  }
}

  async function readProcessedImapUids() {
    try {
      const data = await readFile(imapProcessedPath, "utf8");
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  
  async function saveProcessedImapUids(processed) {
    try {
      await mkdir(dataDir, { recursive: true });
      await writeFile(imapProcessedPath, JSON.stringify(processed, null, 2));
    } catch (error) {
      console.error("Failed to save processed IMAP UIDs:", error);
    }
  }
  
  async function migrateImapToEmailThreads() {
    if (!imapHost || !imapUser || !imapPass) {
      console.log("IMAP not configured, skipping historical email migration");
      return;
    }

    try {
      const migratedCount = await processImapMailboxes({ historical: true });
      console.log(`Successfully migrated ${migratedCount} emails from IMAP`);
    } catch (error) {
      console.error("Migration error:", error);
    }
  }

  async function sendEmailVerificationCode(email, code) {
    if (!hasAnyMailConfig()) {
      throw new Error("Email verification is not configured");
    }

    const message = buildEmailVerificationMessage(code);
    await sendMailWithFallback({
      from: smtpFrom,
      to: email,
      subject: message.subject,
      text: message.text,
    });
  }

createServer(async (request, response) => {
  const forwardedHostHeader = String(request.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const rawHost = forwardedHostHeader || String(request.headers.host || "");
  const requestHost = rawHost.split(":")[0].toLowerCase();
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || `localhost:${port}`}`);
  const pathname = requestUrl.pathname;

  const isAcmeChallengePath = pathname.startsWith("/.well-known/acme-challenge/");

  if ((requestHost === "lofidental.cc" || requestHost === "www.lofidental.cc") && !isAcmeChallengePath) {
    const redirectTarget = `https://lofiesthetic.com${requestUrl.pathname}${requestUrl.search}`;
    response.writeHead(301, {
      Location: redirectTarget,
      "Cache-Control": "public, max-age=300",
    });
    response.end();
    return;
  }

  const basicAuthorized = isAuthorized(request);
  const sessionAuthorized = hasAdminSession(request);
  const adminAuthorized = basicAuthorized || sessionAuthorized;
  let setCookieHeader;

  if (pathname === "/api/reservations" && request.method === "OPTIONS") {
    response.writeHead(204, reservationCorsHeaders);
    response.end();
    return;
  }

  if (pathname === "/api/reservation-email-code" && request.method === "OPTIONS") {
    response.writeHead(204, reservationCorsHeaders);
    response.end();
    return;
  }

  if (pathname === "/api/reservation-email-code/verify" && request.method === "OPTIONS") {
    response.writeHead(204, reservationCorsHeaders);
    response.end();
    return;
  }

  if (pathname === "/api/consult-chat" && request.method === "OPTIONS") {
    response.writeHead(204, reservationCorsHeaders);
    response.end();
    return;
  }

  if (pathname === "/api/instagram/webhook" && request.method === "GET") {
    const mode = requestUrl.searchParams.get("hub.mode") || "";
    const token = requestUrl.searchParams.get("hub.verify_token") || "";
    const challenge = requestUrl.searchParams.get("hub.challenge") || "";

    if (mode === "subscribe" && instagramWebhookVerifyToken && token === instagramWebhookVerifyToken) {
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(challenge);
      return;
    }

    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Instagram webhook verification failed");
    return;
  }

  if (pathname === "/api/instagram/webhook" && request.method === "POST") {
    try {
      const rawBody = await getRawBody(request);
      if (!isValidMetaSignature(rawBody, request.headers["x-hub-signature-256"])) {
        response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Invalid signature");
        return;
      }

      const payload = JSON.parse(rawBody.toString("utf-8") || "{}");
      const entries = Array.isArray(payload.entry) ? payload.entry : [];
      let savedCount = 0;

      for (const entry of entries) {
        const messagingEvents = Array.isArray(entry.messaging) ? entry.messaging : [];
        for (const event of messagingEvents) {
          const senderId = event.sender?.id;
          const text = event.message?.text || event.postback?.title || "";
          if (!senderId || !text) continue;
          const receivedAt = event.timestamp ? new Date(Number(event.timestamp)).toISOString() : new Date().toISOString();
          const saved = await saveInstagramDmMessage(senderId, text, receivedAt);
          if (saved) savedCount += 1;
        }
      }

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true, savedCount }));
    } catch (error) {
      console.error("Failed to process Instagram webhook", error);
      const isPayloadError = error instanceof Error && ["Invalid JSON", "Payload too large"].includes(error.message);
      response.writeHead(isPayloadError ? 400 : 500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: isPayloadError ? "Invalid webhook payload" : "Failed to process Instagram webhook" }));
    }
    return;
  }

  if (pathname === "/api/reservation-email-code" && request.method === "POST") {
    try {
      const payload = await getJsonBody(request);
      const email = String(payload.email || "").trim().toLowerCase();

      if (!isValidEmail(email)) {
        response.writeHead(400, {
          "Content-Type": "application/json; charset=utf-8",
          ...reservationCorsHeaders,
        });
        response.end(JSON.stringify({ message: "A valid email is required" }));
        return;
      }

      if (!(await hasMailExchange(email))) {
        response.writeHead(400, {
          "Content-Type": "application/json; charset=utf-8",
          ...reservationCorsHeaders,
        });
        response.end(JSON.stringify({ message: "Please enter an email address that can receive mail" }));
        return;
      }

      const code = createEmailVerificationCode(email);
      try {
        await sendEmailVerificationCode(email, code);
      } catch (error) {
        removeEmailVerificationCode(email);
        throw error;
      }

      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        ...reservationCorsHeaders,
      });
      response.end(JSON.stringify({ ok: true }));
      return;
    } catch (error) {
      console.error("Failed to send reservation email code", error);
      const isPayloadError = error instanceof Error && ["Invalid JSON", "Payload too large"].includes(error.message);
      const isConfigError = error instanceof Error && error.message === "Email verification is not configured";
      response.writeHead(isPayloadError ? 400 : isConfigError ? 503 : 500, {
        "Content-Type": "application/json; charset=utf-8",
        ...reservationCorsHeaders,
      });
      response.end(JSON.stringify({ message: isPayloadError ? "Invalid request" : isConfigError ? "Email verification is not configured" : "Failed to send verification email" }));
      return;
    }
  }

  if (pathname === "/api/reservation-email-code/verify" && request.method === "POST") {
    try {
      const payload = await getJsonBody(request);
      const email = String(payload.email || "").trim().toLowerCase();
      const emailCode = String(payload.emailCode || "").trim();

      if (!isValidEmail(email)) {
        response.writeHead(400, {
          "Content-Type": "application/json; charset=utf-8",
          ...reservationCorsHeaders,
        });
        response.end(JSON.stringify({ message: "A valid email is required" }));
        return;
      }

      if (!verifyEmailCode(email, emailCode)) {
        response.writeHead(400, {
          "Content-Type": "application/json; charset=utf-8",
          ...reservationCorsHeaders,
        });
        response.end(JSON.stringify({ message: "Please enter the correct verification code" }));
        return;
      }

      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        ...reservationCorsHeaders,
      });
      response.end(JSON.stringify({ ok: true }));
      return;
    } catch (error) {
      console.error("Failed to verify reservation email code", error);
      const isPayloadError = error instanceof Error && ["Invalid JSON", "Payload too large"].includes(error.message);
      response.writeHead(isPayloadError ? 400 : 500, {
        "Content-Type": "application/json; charset=utf-8",
        ...reservationCorsHeaders,
      });
      response.end(JSON.stringify({ message: isPayloadError ? "Invalid request" : "Failed to verify email code" }));
      return;
    }
  }

  if (pathname === "/api/reservations" && request.method === "POST") {
    try {
      const payload = await getJsonBody(request);
      const date = String(payload.date || "").trim();
      const time = String(payload.time || "").trim();
      const email = String(payload.email || "").trim().toLowerCase();
      const emailCode = String(payload.emailCode || "").trim();
      const concerns = String(payload.concerns || "").trim();

      if (!date || !time || !email || !concerns) {
        response.writeHead(400, {
          "Content-Type": "application/json; charset=utf-8",
          ...reservationCorsHeaders,
        });
        response.end(JSON.stringify({ message: "date, time, email, and concerns are required" }));
        return;
      }

      if (!isValidEmail(email)) {
        response.writeHead(400, {
          "Content-Type": "application/json; charset=utf-8",
          ...reservationCorsHeaders,
        });
        response.end(JSON.stringify({ message: "A valid email is required" }));
        return;
      }

      if (!(await hasMailExchange(email))) {
        response.writeHead(400, {
          "Content-Type": "application/json; charset=utf-8",
          ...reservationCorsHeaders,
        });
        response.end(JSON.stringify({ message: "Please enter an email address that can receive mail" }));
        return;
      }

      if (!isEmailVerified(email) && !verifyEmailCode(email, emailCode)) {
        response.writeHead(400, {
          "Content-Type": "application/json; charset=utf-8",
          ...reservationCorsHeaders,
        });
        response.end(JSON.stringify({ message: "Please verify the code sent to your email" }));
        return;
      }

      const record = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date,
        time,
        email,
        concerns,
        createdAt: new Date().toISOString(),
      };

      await addInboxRecord(record);

      removeEmailVerification(email);

      // 이메일 스레드에 예약 요청 메시지 추가 (실패해도 예약은 정상 처리)
      try {
        await saveOrUpdateEmailThread(email, record.id, {
          type: "reservation",
          sentAt: record.createdAt,
          date: record.date,
          time: record.time,
          concerns: record.concerns,
          id: record.id,
          source: "email",
          channel: "email",
        });
      } catch (error) {
        console.error("Failed to save email thread (reservation)", error);
      }

      try {
        const patientInfo = extractPatientInfo(concerns);
        await saveOrUpdatePatient(record, patientInfo);
      } catch (error) {
        console.error("Failed to save patient info", error);
      }

      let autoReplySent = false;
      let notificationSent = false;
      try {
        autoReplySent = await sendReservationAutoReply(record);
        
        // 이메일 스레드에 자동 회신 기록 (실패해도 예약은 정상 처리)
        if (autoReplySent) {
          try {
            const autoReplyMsg = buildReservationAutoReply(record);
            await saveOrUpdateEmailThread(email, record.id, {
              type: "auto-reply",
              sentAt: new Date().toISOString(),
              content: autoReplyMsg.text,
              source: "email",
              channel: "email",
            });
          } catch (error) {
            console.error("Failed to save email thread (auto-reply)", error);
          }
        }
      } catch (error) {
        console.error("Failed to send reservation auto-reply", error);
      }

      try {
        notificationSent = await sendReservationNotification(record);
      } catch (error) {
        console.error("Failed to send reservation notification", error);
      }

      response.writeHead(201, {
        "Content-Type": "application/json; charset=utf-8",
        ...reservationCorsHeaders,
      });
      response.end(JSON.stringify({ ok: true, autoReplySent, notificationSent }));
      return;
    } catch (error) {
      console.error("Failed to save reservation", error);
      const isPayloadError = error instanceof Error && ["Invalid JSON", "Payload too large"].includes(error.message);
      response.writeHead(isPayloadError ? 400 : 500, {
        "Content-Type": "application/json; charset=utf-8",
        ...reservationCorsHeaders,
      });
      response.end(JSON.stringify({ message: "Failed to save reservation" }));
      return;
    }
  }

  if (pathname === "/api/consult-chat" && request.method === "POST") {
    try {
      const payload = await getJsonBody(request);
      const content = String(payload.content || "").trim();
      const attachments = normalizeConsultAttachments(payload.attachments);
      const requestedSessionId = normalizeChatToken(payload.sessionId);
      const deviceId = normalizeChatToken(payload.deviceId, 120);
      const clientIp = getRequestIp(request);

      if (!content && !attachments.length) {
        response.writeHead(400, {
          "Content-Type": "application/json; charset=utf-8",
          ...reservationCorsHeaders,
        });
        response.end(JSON.stringify({ message: "Message is required" }));
        return;
      }

      if (content.length > 2000) {
        response.writeHead(413, {
          "Content-Type": "application/json; charset=utf-8",
          ...reservationCorsHeaders,
        });
        response.end(JSON.stringify({ message: "Message is too long" }));
        return;
      }

      const now = new Date().toISOString();
      const matchedRecord = await findConsultChatRecord({ sessionId: requestedSessionId, deviceId, clientIp });
      const sessionId = requestedSessionId || matchedRecord?.chatSessionId || matchedRecord?.id || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const chatEmail = `${sessionId}@chat.lofi.internal`;
      const existingRecord = matchedRecord || (await readInbox()).find((record) => record.id === sessionId);
      const patientInfo = extractPatientInfo(content);
      const displayName = patientInfo.name || existingRecord?.name || String(payload.displayName || "").trim() || `Visitor ${randomInt(1000, 10000)}`;
      const phone = patientInfo.phone || existingRecord?.phone || null;
      const record = {
        id: sessionId,
        date: "Chat",
        time: "Live",
        email: chatEmail,
        name: displayName,
        concerns: content || "[Photo]",
        source: "consult-chat",
        chatSessionId: sessionId,
        chatDeviceId: deviceId || existingRecord?.chatDeviceId || null,
        clientIp: clientIp || existingRecord?.clientIp || null,
        createdAt: existingRecord?.createdAt || now,
        updatedAt: now,
      };

      if (phone) record.phone = phone;

      const savedRecord = await upsertInboxRecord(record);

      await saveOrUpdateEmailThread(chatEmail, sessionId, {
        type: "customer-reply",
        receivedAt: now,
        content,
        attachments,
        source: "consult-chat",
        channel: "web",
        displayName,
      });

      await saveOrUpdatePatient(savedRecord, {
        name: displayName,
        phone,
      });

      response.writeHead(201, {
        "Content-Type": "application/json; charset=utf-8",
        ...reservationCorsHeaders,
      });
      response.end(JSON.stringify({ ok: true, sessionId, displayName, email: chatEmail, patientInfo }));
      return;
    } catch (error) {
      console.error("Failed to save consult chat", error);
      const isPayloadError = error instanceof Error && ["Invalid JSON", "Payload too large"].includes(error.message);
      response.writeHead(isPayloadError ? 400 : 500, {
        "Content-Type": "application/json; charset=utf-8",
        ...reservationCorsHeaders,
      });
      response.end(JSON.stringify({ message: isPayloadError ? "Invalid request" : "Failed to save chat message" }));
      return;
    }
  }

  if (pathname === "/api/consult-chat" && request.method === "GET") {
    try {
      const requestedSessionId = normalizeChatToken(requestUrl.searchParams.get("sessionId"));
      const deviceId = normalizeChatToken(requestUrl.searchParams.get("deviceId"), 120);
      const clientIp = getRequestIp(request);
      const record = await findConsultChatRecord({ sessionId: requestedSessionId, deviceId, clientIp });

      if (!record) {
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          ...reservationCorsHeaders,
        });
        response.end(JSON.stringify({ ok: true, thread: [] }));
        return;
      }

      const thread = await getConsultThread(record);
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        ...reservationCorsHeaders,
      });
      response.end(JSON.stringify({
        ok: true,
        sessionId: record.chatSessionId || record.id,
        displayName: record.name || "",
        email: record.email,
        thread,
      }));
      return;
    } catch (error) {
      console.error("Failed to load consult chat", error);
      response.writeHead(500, {
        "Content-Type": "application/json; charset=utf-8",
        ...reservationCorsHeaders,
      });
      response.end(JSON.stringify({ message: "Failed to load chat" }));
      return;
    }
  }

  if (pathname === "/api/patient-reply" && request.method === "POST") {
    try {
      const payload = await getJsonBody(request);
      const id = String(payload.id || "").trim();
      const name = String(payload.name || "").trim();
      const visitingFrom = String(payload.visitingFrom || "").trim();
      const phone = String(payload.phone || "").trim();

      if (!id || !name || !phone) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ message: "id, name, and phone are required" }));
        return;
      }

      const inbox = await readInbox();
      const record = inbox.find((r) => r.id === id);

      if (!record) {
        response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ message: "Reservation not found" }));
        return;
      }

      const content = [
        `Name: ${name}`,
        `Visiting from: ${visitingFrom}`,
        `Phone: ${phone}`,
      ].join("\n");

      // 기존 예약 레코드 업데이트 (환자 정보 추가)
      record.name = name;
      record.phone = phone;
      record.visitingFrom = visitingFrom;
      record.updatedAt = new Date().toISOString();

      // Inbox 저장
      try {
        await mkdir(dataDir, { recursive: true });
        await writeFile(inboxPath, JSON.stringify(inbox, null, 2), "utf-8");
      } catch (err) {
        console.error("Failed to save inbox", err);
      }

      // 환자 정보 저장
      try {
        await saveOrUpdatePatient(record, { name, phone });
      } catch (err) {
        console.error("Failed to save patient info from reply", err);
      }

      // 메시지 스레드에 환자 회신으로 추가 (실패해도 성공 응답)
      try {
        await saveOrUpdateEmailThread(record.email, record.id, {
          type: "customer-reply",
          receivedAt: new Date().toISOString(),
          content,
          source: "web",
          channel: "web",
        });
      } catch (err) {
        console.error("Failed to save email thread (patient reply)", err);
      }

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true }));
      return;
    } catch (error) {
      console.error("Failed to save patient reply", error);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Failed to save reply" }));
      return;
    }
  }

  if (pathname === "/api/admin/messages" && request.method === "GET") {
    if (!adminAuthorized) {
      requestAuth(response);
      return;
    }

    try {
      const inbox = await readInbox();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ messages: inbox }));
    } catch (error) {
      console.error("Failed to load admin messages", error);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Failed to load messages" }));
    }
    return;
  }

  if (pathname === "/api/admin/email-status" && request.method === "GET") {
    if (!adminAuthorized) {
      requestAuth(response);
      return;
    }

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(getEmailProviderStatus()));
    return;
  }

  if (pathname.startsWith("/api/admin/patients/") && request.method === "DELETE") {
    if (!adminAuthorized) { requestAuth(response); return; }
    const email = decodeURIComponent(pathname.slice("/api/admin/patients/".length) || "").trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Valid patient email is required" }));
      return;
    }

    try {
      const result = await deletePatientRecord(email);
      response.writeHead(result.deleted ? 200 : 404, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(result.deleted ? { ok: true, ...result } : { message: "Patient not found" }));
    } catch (error) {
      console.error("Failed to delete patient", error);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Failed to delete patient" }));
    }
    return;
  }

  if (pathname.startsWith("/api/admin/patients/") && request.method === "PATCH") {
    if (!adminAuthorized) { requestAuth(response); return; }
    const email = decodeURIComponent(pathname.slice("/api/admin/patients/".length) || "").trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Valid patient email is required" }));
      return;
    }

    try {
      const payload = await getJsonBody(request);
      const name = String(payload.name || "").trim();
      if (!name) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ message: "Patient name is required" }));
        return;
      }
      const patient = await updatePatientName(email, name);
      response.writeHead(patient ? 200 : 404, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(patient ? { ok: true, patient } : { message: "Patient not found" }));
    } catch (error) {
      console.error("Failed to update patient", error);
      const isPayloadError = error instanceof Error && ["Invalid JSON", "Payload too large"].includes(error.message);
      response.writeHead(isPayloadError ? 400 : 500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: isPayloadError ? "Invalid request" : "Failed to update patient" }));
    }
    return;
  }

  if (pathname === "/api/admin/instagram-dms" && request.method === "GET") {
    if (!adminAuthorized) { requestAuth(response); return; }

    try {
      const [threads, patients] = await Promise.all([readEmailThreads(), readPatients()]);
      const patientByEmail = new Map(patients.map((patient) => [String(patient.email || "").toLowerCase(), patient]));
      const conversations = [];
      for (const thread of threads) {
        const messages = (Array.isArray(thread.messages) ? thread.messages : [])
          .filter((message) => message.channel === "instagram" || ["instagram", "instagram-dm", "instagram_dm"].includes(message.source))
          .map((message) => ({
            type: message.type || "customer-reply",
            receivedAt: message.receivedAt || message.sentAt || thread.updatedAt || thread.createdAt,
            content: message.content || message.concerns || "",
            source: message.source || "instagram-dm",
            instagramSenderId: message.instagramSenderId || null,
          }))
          .filter((message) => message.content);

        if (!messages.length) continue;

        const email = String(thread.email || "").toLowerCase();
        const latestMessage = messages[messages.length - 1];
        const patientInfo = extractPatientInfo(messages.map((message) => message.content).join("\n"));
        const fallbackName = `Instagram ${String(latestMessage.instagramSenderId || email).slice(-6)}`;
        let patient = patientByEmail.get(email);

        if (!patient) {
          const record = {
            id: thread.reservationId || email.replace(/@instagram\.lofi\.internal$/, ""),
            email,
            name: patientInfo.name || fallbackName,
            phone: patientInfo.phone || null,
            concerns: latestMessage.content,
            source: "instagram-dm",
            channel: "instagram",
            instagramSenderId: latestMessage.instagramSenderId || null,
            createdAt: thread.createdAt || latestMessage.receivedAt || new Date().toISOString(),
            updatedAt: thread.updatedAt || latestMessage.receivedAt || new Date().toISOString(),
          };
          await saveOrUpdatePatient(record, { name: record.name, phone: record.phone });
          patient = { email, name: record.name, phone: record.phone };
          patientByEmail.set(email, patient);
        }

        conversations.push({
          email,
          reservationId: thread.reservationId || null,
          name: patient?.name || patientInfo.name || fallbackName,
          phone: patient?.phone || patientInfo.phone || null,
          updatedAt: thread.updatedAt || latestMessage.receivedAt || thread.createdAt,
          latest: latestMessage.content,
          messages,
        });
      }

      conversations.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ conversations }));
    } catch (error) {
      console.error("Failed to load Instagram DMs", error);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Failed to load Instagram DMs" }));
    }
    return;
  }

  if (pathname === "/api/admin/instagram-dms/import-screen" && request.method === "POST") {
    if (!adminAuthorized) { requestAuth(response); return; }

    try {
      const payload = await getJsonBody(request);
      const content = String(payload.content || "").trim();
      const senderId = String(payload.senderId || "screen-import").trim();
      const capturedAt = String(payload.capturedAt || "").trim() || new Date().toISOString();

      if (!content) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ message: "Screen text is required" }));
        return;
      }

      if (content.length > 12000) {
        response.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ message: "Screen text is too long" }));
        return;
      }

      const saved = await saveInstagramDmMessage(senderId, content, capturedAt);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true, record: saved }));
    } catch (error) {
      console.error("Failed to import Instagram screen text", error);
      const isPayloadError = error instanceof Error && ["Invalid JSON", "Payload too large"].includes(error.message);
      response.writeHead(isPayloadError ? 400 : 500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: isPayloadError ? "Invalid request" : "Failed to import Instagram screen text" }));
    }
    return;
  }

  if (pathname === "/api/local/instagram-extension/import" && request.method === "POST") {
    if (!isLocalImporterHost(requestHost)) {
      response.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Instagram extension import is available only on the local admin computer." }));
      return;
    }

    if (!isValidInstagramExtensionImporter(request)) {
      response.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Invalid Instagram extension importer header" }));
      return;
    }

    await importInstagramExtensionConversations(request, response);
    return;
  }

  if (pathname === "/api/instagram-extension/import" && request.method === "POST") {
    if (!isValidInstagramExtensionImporter(request)) {
      response.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Invalid Instagram extension importer token" }));
      return;
    }

    await importInstagramExtensionConversations(request, response);
    return;
  }

  if (pathname === "/api/admin/instagram-settings" && request.method === "GET") {
    if (!adminAuthorized) { requestAuth(response); return; }

    try {
      const config = await getInstagramMessagingConfig();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ settings: publicInstagramSettings(config) }));
    } catch (error) {
      console.error("Failed to load Instagram settings", error);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Failed to load Instagram settings" }));
    }
    return;
  }

  if (pathname === "/api/admin/instagram-settings" && request.method === "POST") {
    if (!adminAuthorized) { requestAuth(response); return; }

    try {
      const payload = await getJsonBody(request);
      const existing = await getInstagramMessagingConfig();
      const instagramUsername = String(payload.instagramUsername || "").trim().replace(/^@+/, "");
      const businessAccountId = String(payload.businessAccountId || "").trim() || existing.businessAccountId;
      const accessToken = String(payload.accessToken || "").trim() || existing.accessToken;
      const graphApiVersion = String(payload.graphApiVersion || "v21.0").trim();
      const renderServiceId = String(payload.renderServiceId || "").trim() || renderDefaultServiceId;
      const requestedRenderApiKey = String(payload.renderApiKey || "").trim() || renderApiKey;
      const syncRender = Boolean(payload.syncRender);
      const triggerDeploy = payload.triggerDeploy !== false;

      if (!instagramUsername) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ message: "Instagram ID is required" }));
        return;
      }

      if (syncRender && (!businessAccountId || !accessToken || !graphApiVersion)) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ message: "Business Account ID, Access Token, and Graph API Version are required to sync Render" }));
        return;
      }

      if (syncRender && (!renderServiceId || !requestedRenderApiKey)) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ message: "Render Service ID and Render API Key are required to sync Render" }));
        return;
      }

      const saved = await saveInstagramSettings({ instagramUsername, businessAccountId, accessToken, graphApiVersion });
      let render = null;
      if (syncRender) {
        render = await syncInstagramSettingsToRender({
          serviceId: renderServiceId,
          apiKey: requestedRenderApiKey,
          settings: saved,
          triggerDeploy,
        });
      }

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true, settings: publicInstagramSettings(saved), render }));
    } catch (error) {
      console.error("Failed to save Instagram settings", error);
      const isPayloadError = error instanceof Error && ["Invalid JSON", "Payload too large"].includes(error.message);
      response.writeHead(isPayloadError ? 400 : 500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: isPayloadError ? "Invalid request" : error.message || "Failed to save Instagram settings" }));
    }
    return;
  }

  if (pathname.startsWith("/api/admin/instagram-dms/") && pathname.endsWith("/reply") && request.method === "POST") {
    if (!adminAuthorized) { requestAuth(response); return; }

    const senderId = decodeURIComponent(pathname.slice("/api/admin/instagram-dms/".length, -"/reply".length));
    try {
      const payload = await getJsonBody(request);
      const content = String(payload.content || "").trim();

      if (!senderId || !content) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ message: "senderId and content are required" }));
        return;
      }

      if (content.length > 1000) {
        response.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ message: "Message is too long" }));
        return;
      }

      const email = `instagram-${senderId.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase()}@instagram.lofi.internal`;
      const threads = await readEmailThreads();
      const thread = threads.find((item) => String(item.email || "").toLowerCase() === email);
      if (!thread) {
        response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ message: "Instagram conversation not found" }));
        return;
      }

      const result = await sendInstagramDmReply(senderId, content);
      const sentAt = new Date().toISOString();
      await saveOrUpdateEmailThread(email, thread.reservationId || `instagram-${senderId}`, {
        type: "admin-reply",
        sentAt,
        content,
        source: "instagram-dm",
        channel: "instagram",
        instagramSenderId: senderId,
      });

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true, sentAt, result }));
    } catch (error) {
      console.error("Failed to send Instagram reply", error);
      const isPayloadError = error instanceof Error && ["Invalid JSON", "Payload too large"].includes(error.message);
      const isConfigError = error instanceof Error && error.message === "Instagram messaging is not configured";
      response.writeHead(isPayloadError ? 400 : isConfigError ? 503 : error.statusCode || 500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: isPayloadError ? "Invalid request" : isConfigError ? "Instagram messaging is not configured" : error.message || "Failed to send Instagram reply" }));
    }
    return;
  }

  if (pathname === "/api/admin/reservations" && request.method === "POST") {
    if (!adminAuthorized) { requestAuth(response); return; }

    try {
      const payload = await getJsonBody(request);
      const date = String(payload.date || "").trim();
      const time = String(payload.time || "").trim();
      const email = String(payload.email || "").trim().toLowerCase();
      const concerns = String(payload.concerns || "").trim();
      const name = String(payload.name || "").trim();
      const phone = String(payload.phone || "").trim();
      const visitingFrom = String(payload.visitingFrom || "").trim();

      if (!date || !time || !name) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ message: "date, time, and name are required" }));
        return;
      }

      if (email && !isValidEmail(email)) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ message: "A valid email is required" }));
        return;
      }

      const record = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date,
        time,
        name,
        createdAt: new Date().toISOString(),
      };

      if (email) record.email = email;
      if (concerns) record.concerns = concerns;
      if (phone) record.phone = phone;
      if (visitingFrom) record.visitingFrom = visitingFrom;

      await addInboxRecord(record);

      // Keep thread/patient data in sync for every admin-created schedule entry.
      const threadEmail = getPatientThreadEmail(record);
      try {
        await saveOrUpdateEmailThread(threadEmail, record.id, {
          type: "reservation",
          sentAt: record.createdAt,
          date: record.date,
          time: record.time,
          concerns: record.concerns || `Scheduled appointment for ${name}`,
          id: record.id,
          source: "schedule",
          channel: "email",
        });
      } catch (error) {
        console.error("Failed to save email thread (admin create)", error);
      }

      try {
        await saveOrUpdatePatient(record, { name: name || null, phone: phone || null });
      } catch (error) {
        console.error("Failed to save patient info (admin create)", error);
      }

      response.writeHead(201, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true, record }));
    } catch (error) {
      console.error("Failed to create reservation", error);
      const isPayloadError = error instanceof Error && ["Invalid JSON", "Payload too large"].includes(error.message);
      response.writeHead(isPayloadError ? 400 : 500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Failed to create reservation" }));
    }
    return;
  }

  if (pathname.startsWith("/api/admin/reservations/") && request.method === "PUT") {
    if (!adminAuthorized) { requestAuth(response); return; }
    const id = pathname.slice("/api/admin/reservations/".length);
    if (!id) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Missing id" }));
      return;
    }

    try {
      const payload = await getJsonBody(request);
      const date = String(payload.date || "").trim();
      const time = String(payload.time || "").trim();
      const email = String(payload.email || "").trim().toLowerCase();
      const concerns = String(payload.concerns || "").trim();
      const createdAt = String(payload.createdAt || "").trim() || new Date().toISOString();
      const name = String(payload.name || "").trim();
      const phone = String(payload.phone || "").trim();
      const visitingFrom = String(payload.visitingFrom || "").trim();

      if (!date || !time) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ message: "date and time are required" }));
        return;
      }

      if (email && !isValidEmail(email)) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ message: "A valid email is required" }));
        return;
      }

      const nextRecord = {
        id,
        date,
        time,
        createdAt,
        updatedAt: new Date().toISOString(),
      };

      if (email) nextRecord.email = email;
      if (concerns) nextRecord.concerns = concerns;
      if (name) nextRecord.name = name;
      if (phone) nextRecord.phone = phone;
      if (visitingFrom) nextRecord.visitingFrom = visitingFrom;

      const collection = await getInboxCollection();
      if (collection) {
        const existing = await collection.findOne({ id }, { projection: { _id: 0 } });
        const merged = {
          ...(existing || {}),
          ...nextRecord,
          id,
          createdAt: existing?.createdAt || nextRecord.createdAt,
        };
        await collection.replaceOne({ id }, merged, { upsert: true });
        try {
          await saveOrUpdatePatient(merged, { name: merged.name || null, phone: merged.phone || null });
        } catch (error) {
          console.error("Failed to save patient info (admin update)", error);
        }
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true, record: merged }));
        return;
      }

      const inbox = await readInbox();
      const idx = inbox.findIndex((r) => r.id === id);
      if (idx >= 0) {
        const existing = inbox[idx] || {};
        inbox[idx] = {
          ...existing,
          ...nextRecord,
          id,
          createdAt: existing.createdAt || nextRecord.createdAt,
        };
      } else {
        inbox.unshift(nextRecord);
      }

      await mkdir(dataDir, { recursive: true });
      await writeFile(inboxPath, JSON.stringify(inbox, null, 2), "utf-8");

      const savedRecord = idx >= 0 ? inbox[idx] : nextRecord;
      try {
        await saveOrUpdatePatient(savedRecord, { name: savedRecord.name || null, phone: savedRecord.phone || null });
      } catch (error) {
        console.error("Failed to save patient info (admin update)", error);
      }

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true, record: savedRecord }));
    } catch (error) {
      console.error("Failed to update reservation", error);
      const isPayloadError = error instanceof Error && ["Invalid JSON", "Payload too large"].includes(error.message);
      response.writeHead(isPayloadError ? 400 : 500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Failed to update reservation" }));
    }
    return;
  }

  if (pathname.startsWith("/api/admin/reservations/") && request.method === "DELETE") {
    if (!adminAuthorized) { requestAuth(response); return; }
    const id = pathname.slice("/api/admin/reservations/".length);
    if (!id) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Missing id" }));
      return;
    }
    try {
      const deleted = await deleteInboxRecord(id);
      response.writeHead(deleted ? 200 : 404, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(deleted ? { ok: true } : { message: "Not found" }));
    } catch (error) {
      console.error("Failed to delete reservation", error);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Failed to delete" }));
    }
    return;
  }

  if (pathname.startsWith("/api/admin/email-thread/") && pathname.endsWith("/reply") && request.method === "POST") {
    if (!adminAuthorized) { requestAuth(response); return; }

    const prefix = "/api/admin/email-thread/";
    const suffix = "/reply";
    const encodedEmail = pathname.slice(prefix.length, pathname.length - suffix.length);
    const email = decodeURIComponent(encodedEmail || "").trim().toLowerCase();

    if (!email || !isValidEmail(email)) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Valid email is required" }));
      return;
    }

    try {
      const payload = await getJsonBody(request);
      const content = String(payload.content || "").trim();
      const subject = String(payload.subject || "").trim() || "Reply from lofi dental";
      const channel = String(payload.channel || "email").trim().toLowerCase();
      const isWebReply = channel === "web" || email.endsWith("@chat.lofi.internal");

      if (!content) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ message: "Reply content is required" }));
        return;
      }

      if (!isWebReply && !hasAnyMailConfig()) {
        response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ message: "Email provider is not configured" }));
        return;
      }

      if (!isWebReply) {
        await sendMailWithFallback({
          from: smtpFrom,
          to: email,
          subject,
          text: content,
        });
      }

      const inbox = await readInbox();
      const record = inbox.find((r) => String(r.email || "").toLowerCase() === email);
      const reservationId = String(payload.reservationId || "").trim() || record?.id || `manual-${Date.now()}`;

      const threadMessage = {
        type: "admin-reply",
        sentAt: new Date().toISOString(),
        content,
        source: isWebReply ? "consult-chat" : "email",
        channel: isWebReply ? "web" : "email",
      };

      try {
        await saveOrUpdateEmailThread(email, reservationId, threadMessage);
      } catch (error) {
        console.error("Failed to save email thread (admin reply)", error);
      }

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true, message: threadMessage, reservationId, delivered: !isWebReply ? "email" : "web" }));
    } catch (error) {
      console.error("Failed to send admin reply", error);
      const isPayloadError = error instanceof Error && ["Invalid JSON", "Payload too large"].includes(error.message);
      response.writeHead(isPayloadError ? 400 : 500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: isPayloadError ? "Invalid request" : "Failed to send reply" }));
    }
    return;
  }

  if (pathname.startsWith("/api/admin/email-thread/") && pathname.endsWith("/read") && request.method === "POST") {
    if (!adminAuthorized) { requestAuth(response); return; }

    const prefix = "/api/admin/email-thread/";
    const suffix = "/read";
    const encodedEmail = pathname.slice(prefix.length, pathname.length - suffix.length);
    const email = decodeURIComponent(encodedEmail || "").trim().toLowerCase();

    if (!email || !isValidEmail(email)) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Valid email is required" }));
      return;
    }

    try {
      const payload = await getJsonBody(request).catch(() => ({}));
      const channel = String(payload.channel || "web").trim().toLowerCase();
      const result = await markEmailThreadMessagesRead(email, channel);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true, changed: result.changed, thread: result.thread }));
    } catch (error) {
      console.error("Failed to mark email thread read", error);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Failed to mark thread read" }));
    }
    return;
  }

  if (pathname.startsWith("/api/admin/email-thread/") && pathname.includes("/messages/") && request.method === "DELETE") {
    if (!adminAuthorized) { requestAuth(response); return; }

    const prefix = "/api/admin/email-thread/";
    const remainder = pathname.slice(prefix.length);
    const marker = "/messages/";
    const markerIndex = remainder.indexOf(marker);
    const email = decodeURIComponent(remainder.slice(0, markerIndex)).trim().toLowerCase();
    const messageIndex = Number(decodeURIComponent(remainder.slice(markerIndex + marker.length)));

    if (!email || !isValidEmail(email) || !Number.isInteger(messageIndex) || messageIndex < 0) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Valid email and message index are required" }));
      return;
    }

    try {
      const result = await deleteEmailThreadMessage(email, messageIndex);
      response.writeHead(result.deleted ? 200 : 404, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(result.deleted ? { ok: true, thread: result.thread } : { message: "Message not found", thread: result.thread }));
    } catch (error) {
      console.error("Failed to delete email thread message", error);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Failed to delete message" }));
    }
    return;
  }

  if (pathname.startsWith("/api/admin/email-thread/") && request.method === "GET") {
    if (!adminAuthorized) { requestAuth(response); return; }
    const email = decodeURIComponent(pathname.slice("/api/admin/email-thread/".length));
    if (!email) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Email is required" }));
      return;
    }
    try {
      const emailThreads = await readEmailThreads();
      const threadData = emailThreads.find((t) => t.email && t.email.toLowerCase() === email.toLowerCase());
      const thread = threadData?.messages || [];
      const inbox = await readInbox();
      const fallbackRecord = inbox.find((r) => String(r.email || "").toLowerCase() === email.toLowerCase());
      const reservationId = threadData?.reservationId || fallbackRecord?.id || null;
      
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ email, reservationId, thread }));
    } catch (error) {
      console.error("Failed to load email thread", error);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Failed to load thread" }));
    }
    return;
  }

  if (pathname.startsWith("/api/admin/reservations/") && pathname.endsWith("/reply") && request.method === "POST") {
    const pathParts = pathname.slice("/api/admin/reservations/".length).split("/");
    const id = pathParts[0];
    if (!id) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8", ...reservationCorsHeaders });
      response.end(JSON.stringify({ message: "Missing reservation id" }));
      return;
    }
    try {
      const payload = await getJsonBody(request);
      const name = String(payload.name || "").trim();
      const phone = String(payload.phone || "").trim();
      if (!name && !phone) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8", ...reservationCorsHeaders });
        response.end(JSON.stringify({ message: "Name or phone is required" }));
        return;
      }
      const inbox = await readInbox();
      const record = inbox.find((r) => r.id === id);
      if (!record) {
        response.writeHead(404, { "Content-Type": "application/json; charset=utf-8", ...reservationCorsHeaders });
        response.end(JSON.stringify({ message: "Reservation not found" }));
        return;
      }
      const patientInfo = { name: name || null, phone: phone || null };
      await saveOrUpdatePatient(record, patientInfo);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", ...reservationCorsHeaders });
      response.end(JSON.stringify({ ok: true }));
    } catch (error) {
      console.error("Failed to save reply", error);
      const isPayloadError = error instanceof Error && ["Invalid JSON", "Payload too large"].includes(error.message);
      response.writeHead(isPayloadError ? 400 : 500, { "Content-Type": "application/json; charset=utf-8", ...reservationCorsHeaders });
      response.end(JSON.stringify({ message: "Failed to save reply" }));
    }
    return;
  }

  if (pathname === "/api/admin/patients" && request.method === "GET") {
    if (!adminAuthorized) { requestAuth(response); return; }
    try {
      await syncInboxReservationsToPatients();
      const patients = sortPatientsByLatestInput(await readPatients());
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ patients }));
    } catch (error) {
      console.error("Failed to load patients", error);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Failed to load patients" }));
    }
    return;
  }

  if (pathname === "/api/admin/traffic" && request.method === "GET") {
    if (!adminAuthorized) { requestAuth(response); return; }
    try {
      const today = getKoreanDay();
      const sinceDay = addDaysToDay(today, -29);
      const events = await readTrafficEvents({ sinceDay, limit: 15000 });
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(JSON.stringify(summarizeTraffic(events)));
    } catch (error) {
      console.error("Failed to load traffic analytics", error);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Failed to load traffic analytics" }));
    }
    return;
  }

  if (pathname === "/api/admin/login" && request.method === "POST") {
    try {
      const payload = await getJsonBody(request);
      const user = String(payload.user || "").trim();
      const pass = String(payload.pass || "").trim();
      if (user === adminUser && pass === adminPass) {
        const cookie = `${adminSessionCookie}=${adminSessionValue}; Path=/; HttpOnly; SameSite=Lax`;
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie": cookie,
        });
        response.end(JSON.stringify({ ok: true }));
      } else {
        response.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ message: "Invalid credentials" }));
      }
    } catch {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Invalid request" }));
    }
    return;
  }

  if (pathname === "/api/admin/instagram-login" && request.method === "GET") {
    if (!isInstagramLoginConfigured()) {
      response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Instagram login is not configured. Set INSTAGRAM_CLIENT_ID, INSTAGRAM_CLIENT_SECRET, and INSTAGRAM_ADMIN_USERS or INSTAGRAM_ADMIN_IDS.");
      return;
    }

    const next = requestUrl.searchParams.get("next") || "/admin";
    const state = createInstagramAuthState(next);
    const authorizeUrl = new URL("https://api.instagram.com/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", instagramClientId);
    authorizeUrl.searchParams.set("redirect_uri", getInstagramRedirectUri(request));
    authorizeUrl.searchParams.set("scope", "user_profile");
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("state", state);

    response.writeHead(302, { Location: authorizeUrl.toString() });
    response.end();
    return;
  }

  if (pathname === "/api/admin/instagram-callback" && request.method === "GET") {
    try {
      const error = requestUrl.searchParams.get("error") || "";
      if (error) {
        throw new Error(requestUrl.searchParams.get("error_description") || error);
      }

      const code = requestUrl.searchParams.get("code") || "";
      const state = requestUrl.searchParams.get("state") || "";
      const stateEntry = consumeInstagramAuthState(state);
      if (!code || !stateEntry) {
        throw new Error("Invalid Instagram login session");
      }

      const accessToken = await exchangeInstagramCodeForToken(code, getInstagramRedirectUri(request));
      const profile = await getInstagramProfile(accessToken);
      if (!isAllowedInstagramAdmin(profile)) {
        response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("This Instagram account is not allowed to access admin.");
        return;
      }

      const cookie = `${adminSessionCookie}=${adminSessionValue}; Path=/; HttpOnly; SameSite=Lax`;
      response.writeHead(302, {
        Location: stateEntry.next || "/admin",
        "Set-Cookie": cookie,
      });
      response.end();
    } catch (error) {
      console.error("Instagram admin login failed", error);
      response.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Instagram login failed. Please return to admin and try again.");
    }
    return;
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!adminAuthorized) {
      const acceptHeader = String(request.headers.accept || "");
      if (acceptHeader.includes("text/html")) {
        const loginHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin Login | lofi dental</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: "Segoe UI", "Helvetica Neue", sans-serif;
      background: radial-gradient(circle at 12% 8%, rgba(220,200,237,.66), transparent 42%),
                  radial-gradient(circle at 88% 14%, rgba(230,213,245,.72), transparent 46%),
                  linear-gradient(170deg, #f5f7ff 0%, #e7edff 100%);
      color: #1f2d66;
    }
    .card {
      background: rgba(255,255,255,.96);
      border: 1px solid rgba(90,111,218,.2);
      border-radius: 24px;
      padding: 40px 36px;
      width: min(380px, 92vw);
      box-shadow: 0 18px 48px rgba(31,45,102,.1);
    }
    .logo { text-align: center; margin-bottom: 28px; }
    .logo img { width: 180px; height: auto; }
    h1 { margin: 0 0 24px; font-size: 1.4rem; font-weight: 700; text-align: center; }
    label { display: block; font-size: .85rem; font-weight: 700; margin-bottom: 6px; color: #5a6fda; }
    input {
      width: 100%; padding: 12px 14px; border: 1px solid rgba(90,111,218,.3);
      border-radius: 10px; font: inherit; font-size: .97rem; outline: none;
      background: #f8f9ff; color: #1f2d66; margin-bottom: 16px;
      transition: border-color 150ms;
    }
    input:focus { border-color: #5b3d8f; background: #fff; }
    button {
      width: 100%; padding: 13px; background: #5b3d8f; color: #fff;
      border: none; border-radius: 999px; font: inherit; font-size: 1rem;
      font-weight: 700; cursor: pointer; transition: opacity 150ms;
      margin-top: 4px;
    }
    button:hover { opacity: .88; }
    .instagram-login {
      display: flex; align-items: center; justify-content: center; gap: 10px;
      width: 100%; margin-top: 12px; padding: 13px;
      border: 1px solid rgba(90,111,218,.22); border-radius: 999px;
      background: #fff; color: #1f2d66; text-decoration: none;
      font-weight: 800; transition: opacity 150ms, transform 150ms;
    }
    .instagram-login:hover { opacity: .9; transform: translateY(-1px); }
    .instagram-login.is-disabled { opacity: .55; pointer-events: none; }
    .login-note { margin: 10px 0 0; min-height: 1em; color: #5a6fda; font-size: .78rem; text-align: center; }
    .err { color: #c0392b; font-size: .88rem; margin-top: 10px; text-align: center; min-height: 1.2em; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo"><img src="/assets/영문로고.png" alt="lofi dental" /></div>
    <h1>Admin Login</h1>
    <form id="loginForm">
      <label for="user">Username</label>
      <input id="user" name="user" type="text" autocomplete="username" required />
      <label for="pass">Password</label>
      <input id="pass" name="pass" type="password" autocomplete="current-password" required />
      <button type="submit">Sign in</button>
      <p class="err" id="errMsg"></p>
    </form>
    <a class="instagram-login${isInstagramLoginConfigured() ? "" : " is-disabled"}" href="/api/admin/instagram-login?next=${encodeURIComponent(requestUrl.searchParams.get("next") || "/admin")}">Log in with Instagram</a>
    <p class="login-note">${isInstagramLoginConfigured() ? "" : "Instagram login requires server configuration."}</p>
  </div>
  <script>
    const dest = new URLSearchParams(location.search).get("next") || "/admin";
    document.getElementById("loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button");
      btn.disabled = true;
      btn.textContent = "Signing in\u2026";
      try {
        const res = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user: document.getElementById("user").value,
            pass: document.getElementById("pass").value,
          }),
        });
        if (res.ok) {
          location.href = dest;
        } else {
          document.getElementById("errMsg").textContent = "Incorrect username or password.";
          btn.disabled = false;
          btn.textContent = "Sign in";
        }
      } catch {
        document.getElementById("errMsg").textContent = "Connection error. Try again.";
        btn.disabled = false;
        btn.textContent = "Sign in";
      }
    });
  </script>
</body>
</html>`;
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(loginHtml);
        return;
      }
      requestAuth(response);
      return;
    }

    if (basicAuthorized && !sessionAuthorized) {
      setCookieHeader = `${adminSessionCookie}=${adminSessionValue}; Path=/; HttpOnly; SameSite=Lax`;
    }
  }

  const safeRelativePath = resolvePath(request.url);
  const safeAbsolutePath = path.normalize(path.join(rootDir, safeRelativePath));

  if (!safeAbsolutePath.startsWith(rootDir)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(safeAbsolutePath);
    const extension = path.extname(safeAbsolutePath).toLowerCase();
    const contentType = mimeTypes[extension] || "application/octet-stream";
    if (shouldTrackTraffic(request, pathname, safeRelativePath, extension)) {
      try {
        await saveTrafficEvent(createTrafficEvent(request, requestUrl));
      } catch (error) {
        console.error("Failed to record traffic event", error);
      }
    }

    if (extension === ".mp4") {
      const range = String(request.headers.range || "");
      const match = range.match(/^bytes=(\d*)-(\d*)$/);
      if (match) {
        const size = file.length;
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;

        if (Number.isInteger(start) && Number.isInteger(end) && start <= end && start < size) {
          response.writeHead(206, {
            "Content-Type": contentType,
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes ${start}-${end}/${size}`,
            "Content-Length": String(end - start + 1),
            ...(setCookieHeader ? { "Set-Cookie": setCookieHeader } : {}),
          });
          response.end(request.method === "HEAD" ? undefined : file.subarray(start, end + 1));
          return;
        }

        response.writeHead(416, {
          "Content-Range": `bytes */${size}`,
          "Accept-Ranges": "bytes",
          ...(setCookieHeader ? { "Set-Cookie": setCookieHeader } : {}),
        });
        response.end();
        return;
      }
    }

    response.writeHead(200, {
      "Content-Type": contentType,
      ...(extension === ".mp4" ? { "Accept-Ranges": "bytes", "Content-Length": String(file.length) } : {}),
      ...(setCookieHeader ? { "Set-Cookie": setCookieHeader } : {}),
    });
    response.end(request.method === "HEAD" ? undefined : file);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, () => {
  console.log(`Lofi Web running on http://localhost:${port}`);
  console.log(`Admin page: http://localhost:${port}/admin`);
  migrateInboxToEmailThreads().catch(err => console.error("Migration error:", err));
  migrateImapToEmailThreads().catch(err => console.error("IMAP migration error:", err));
  startEmailReplyChecker();
});
