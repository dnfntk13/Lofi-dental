import { createServer } from "node:http";
import { randomInt } from "node:crypto";
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
const dataDir = path.join(rootDir, ".data");
const inboxPath = path.join(dataDir, "reservation-inbox.json");
const emailThreadsPath = path.join(dataDir, "email-threads.json");
const imapProcessedPath = path.join(dataDir, "imap-processed.json");
const mongoUri = process.env.MONGODB_URI || "";
const mongoDatabaseName = process.env.MONGODB_DB_NAME || "lofi-dental";
const mongoCollectionName = process.env.MONGODB_COLLECTION || "reservationMessages";
const patientsCollectionName = process.env.MONGODB_PATIENTS_COLLECTION || "patients";
const emailThreadsCollectionName = process.env.MONGODB_EMAIL_THREADS_COLLECTION || "emailThreads";
const patientsPath = path.join(dataDir, "patients.json");
let patientsCollectionPromise;
let emailThreadsCollectionPromise;
const smtpHost = process.env.SMTP_HOST || "";
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER || "";
const smtpPass = process.env.SMTP_PASS || "";
const smtpFrom = process.env.SMTP_FROM || smtpUser;
const imapHost = process.env.IMAP_HOST || "";
const imapPort = Number(process.env.IMAP_PORT || 993);
const imapUser = process.env.IMAP_USER || smtpUser;
const imapPass = process.env.IMAP_PASS || smtpPass;
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
const emailVerificationTtlMs = 10 * 60 * 1000;
const emailResolver = new Resolver();
emailResolver.setServers(emailDnsServers);
const reservationCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

  if (["/admin/calendar", "/admin/calendar/"].includes(pathname)) {
    return "/admin/calendar.html";
  }

  if (["/admin/messages", "/admin/messages/"].includes(pathname)) {
    return "/admin/messages.html";
  }

  if (["/admin/patients", "/admin/patients/"].includes(pathname)) {
    return "/admin/patients.html";
  }

  if (["/admin", "/admin/"].includes(pathname)) {
    return "/admin/calendar.html";
  }

  if (["/admin/reply", "/admin/reply/"].includes(pathname)) {
    return "/admin/reply.html";
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

async function saveOrUpdateEmailThread(email, reservationId, messageData) {
  const now = new Date().toISOString();
  const collection = await getEmailThreadsCollection();
  
  if (collection) {
    await collection.updateOne(
      { email },
      {
        $set: { email, reservationId, updatedAt: now },
        $setOnInsert: { id: `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: now, messages: [] },
        $push: { messages: messageData },
      },
      { upsert: true }
    );
    return;
  }

  const threads = await readEmailThreads();
  const idx = threads.findIndex((t) => t.email === email);
  if (idx >= 0) {
    threads[idx].messages.push(messageData);
    threads[idx].updatedAt = now;
  } else {
    threads.unshift({
      id: `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      email,
      reservationId,
      messages: [messageData],
      createdAt: now,
      updatedAt: now,
    });
  }
  await mkdir(dataDir, { recursive: true });
  await writeFile(emailThreadsPath, JSON.stringify(threads, null, 2), "utf-8");
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

function extractPatientInfo(text) {
  const result = { name: null, phone: null };
  const namePatterns = [
    /(?:이름|성함)\s*[:：]\s*(.+)/i,
    /name\s*[:：]\s*(.+)/i,
  ];
  const phonePatterns = [
    /(?:전화|연락처|휴대폰|핸드폰)\s*번?호?\s*[:：]\s*([\d\s\-+().]+)/i,
    /phone\s*(?:number)?\s*[:：]\s*([\d\s\-+().]+)/i,
    /((?:\+?82|0)\d[\d\s\-]{7,14}\d)/,
  ];
  for (const p of namePatterns) {
    const m = text.match(p);
    if (m) { result.name = m[1].trim().split(/\n/)[0].trim().slice(0, 80); break; }
  }
  for (const p of phonePatterns) {
    const m = text.match(p);
    if (m) { result.phone = m[1].trim().replace(/\s+/g, "-").slice(0, 30); break; }
  }
  return result;
}

async function saveOrUpdatePatient(record, patientInfo) {
  if (!patientInfo.name && !patientInfo.phone) return;
  const now = new Date().toISOString();
  const collection = await getPatientsCollection();
  if (collection) {
    await collection.updateOne(
      { email: record.email },
      {
        $set: { email: record.email, ...(patientInfo.name && { name: patientInfo.name }), ...(patientInfo.phone && { phone: patientInfo.phone }), updatedAt: now },
        $setOnInsert: { id: `patient-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, firstSeen: now },
        $addToSet: { reservationIds: record.id },
      },
      { upsert: true }
    );
    return;
  }
  const patients = await readPatients();
  const idx = patients.findIndex((p) => p.email === record.email);
  if (idx >= 0) {
    const p = patients[idx];
    if (patientInfo.name) p.name = patientInfo.name;
    if (patientInfo.phone) p.phone = patientInfo.phone;
    p.updatedAt = now;
    if (!p.reservationIds) p.reservationIds = [];
    if (!p.reservationIds.includes(record.id)) p.reservationIds.push(record.id);
  } else {
    patients.unshift({ id: `patient-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, email: record.email, name: patientInfo.name || null, phone: patientInfo.phone || null, firstSeen: now, updatedAt: now, reservationIds: [record.id] });
  }
  await mkdir(dataDir, { recursive: true });
  await writeFile(patientsPath, JSON.stringify(patients, null, 2), "utf-8");
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
  const replyFormUrl = `https://lofiesthetic.com/admin/reply?id=${record.id}`;

  return {
    subject: "Your reservation has been confirmed | lofi dental",
    text: `Hello,

Your reservation for ${appointmentKst} has been confirmed.

Please provide us with the following information by visiting the link below:

${replyFormUrl}

Name:
Where you are visiting from:
Phone number:

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

async function checkEmailReplies() {
  if (!imapHost || !imapUser || !imapPass) {
    return;
  }

  return new Promise((resolve) => {
    const imap = new Imap({
      user: imapUser,
      password: imapPass,
      host: imapHost,
      port: imapPort,
      tls: imapPort === 993,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
      authTimeout: 10000,
    });

    imap.openBox("INBOX", false, async (err) => {
      if (err) {
        console.error("Failed to open IMAP inbox", err);
        imap.end();
        resolve();
        return;
      }

      try {
        imap.search(["UNSEEN"], async (searchErr, results) => {
          if (searchErr || !results || results.length === 0) {
            imap.end();
            resolve();
            return;
          }

          const f = imap.fetch(results, { bodies: "" });
          f.on("message", (msg) => {
            simpleParser(msg, async (parseErr, parsed) => {
              if (parseErr) {
                console.error("Failed to parse email", parseErr);
                return;
              }

              try {
                const fromEmail = parsed.from?.text?.toLowerCase() || "";
                const text = parsed.text || "";
                const inReplyTo = parsed.inReplyTo || parsed.headers?.get("in-reply-to") || "";

                if (!text) return;

                const inbox = await readInbox();

                for (const record of inbox) {
                  if (record.email.toLowerCase() === fromEmail) {
                    const patientInfo = extractPatientInfo(text);
                    if (patientInfo.name || patientInfo.phone) {
                      await saveOrUpdatePatient(record, patientInfo);
                      console.log(`Updated patient info from reply: ${record.email}`);
                    }
                    
                    // 이메일 스레드에 환자 회신 추가
                    await saveOrUpdateEmailThread(record.email, record.id, {
                      type: "customer-reply",
                      receivedAt: new Date().toISOString(),
                      content: text.slice(0, 2000), // 텍스트 일부만 저장
                    });
                    
                    break;
                  }
                }
              } catch (error) {
                console.error("Error processing reply email", error);
              }
            });
          });

          f.on("error", (err) => {
            console.error("IMAP fetch error", err);
          });

          f.on("end", () => {
            imap.end();
            resolve();
          });
        });
      } catch (error) {
        console.error("Error in checkEmailReplies", error);
        imap.end();
        resolve();
      }
    });

    imap.on("error", (err) => {
      console.error("IMAP error", err);
      resolve();
    });

    imap.on("end", () => {
      resolve();
    });

    imap.openBox("INBOX", false, () => {
      imap.end();
    });
  });
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
      });
      
      // 자동 회신 메시지 추가 (과거 데이터이므로 추정)
      const autoReplyMsg = buildReservationAutoReply(reservation);
      await saveOrUpdateEmailThread(reservation.email, reservation.id, {
        type: "auto-reply",
        sentAt: new Date(new Date(reservation.createdAt).getTime() + 10000).toISOString(),
        content: autoReplyMsg.text,
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
      const inbox = await readInbox();
      const patientEmails = new Set(inbox.map(r => r.email?.toLowerCase()).filter(Boolean));
      
      if (patientEmails.size === 0) {
        console.log("No patient emails found for IMAP migration");
        return;
      }
      
      const processed = await readProcessedImapUids();
      const currentProcessed = { ...processed };
      let migratedCount = 0;
      
      console.log(`Starting historical IMAP email migration for ${patientEmails.size} patient emails...`);
      
      return new Promise((resolve) => {
        const imap = new Imap({
          user: imapUser,
          password: imapPass,
          host: imapHost,
          port: imapPort,
          tls: imapPort === 993,
          tlsOptions: { rejectUnauthorized: false },
          connTimeout: 10000,
          authTimeout: 10000,
        });
        
        imap.openBox("INBOX", false, async (err) => {
          if (err) {
            console.error("Failed to open IMAP inbox for historical migration:", err);
            imap.end();
            resolve();
            return;
          }
          
          try {
            imap.search(["ALL"], async (searchErr, results) => {
              if (searchErr || !results || results.length === 0) {
                console.log("No emails found in IMAP inbox");
                imap.end();
                resolve();
                return;
              }
              
              console.log(`Found ${results.length} emails in IMAP inbox, checking for patient emails...`);
              
              const f = imap.fetch(results, { bodies: "" });
              const emailsToProcess = [];
              
              f.on("message", (msg, seqno) => {
                emailsToProcess.push({ msg, seqno });
              });
              
              f.on("error", (err) => {
                console.error("IMAP fetch error during migration:", err);
              });
              
              f.on("end", async () => {
                // Process all fetched emails
                for (const { msg, seqno } of emailsToProcess) {
                  const uidKey = `uid-${seqno}`;
                  
                  // Skip if already processed
                  if (processed[uidKey]) {
                    continue;
                  }
                  
                  await new Promise((resolveMsg) => {
                    simpleParser(msg, async (parseErr, parsed) => {
                      if (parseErr) {
                        console.error("Failed to parse email:", parseErr);
                        resolveMsg();
                        return;
                      }
                      
                      try {
                        const fromEmail = parsed.from?.text?.toLowerCase() || "";
                        const toEmail = parsed.to?.text?.toLowerCase() || "";
                        const text = parsed.text || "";
                        const sentDate = parsed.date || new Date();
                        
                        // Check if this email is from a patient or sent to a patient
                        for (const patientEmail of patientEmails) {
                          if (fromEmail === patientEmail) {
                            // Email FROM patient - add as customer-reply
                            const reservation = inbox.find(r => r.email?.toLowerCase() === patientEmail);
                            if (reservation && text) {
                              await saveOrUpdateEmailThread(patientEmail, reservation.id, {
                                type: "customer-reply",
                                receivedAt: new Date(sentDate).toISOString(),
                                content: text.slice(0, 2000),
                              });
                              migratedCount++;
                              currentProcessed[uidKey] = true;
                              break;
                            }
                          } else if (toEmail.includes(patientEmail)) {
                            // Email TO patient from admin - add as admin-sent
                            const reservation = inbox.find(r => r.email?.toLowerCase() === patientEmail);
                            if (reservation && text) {
                              await saveOrUpdateEmailThread(patientEmail, reservation.id, {
                                type: "customer-reply", // Reusing customer-reply type for admin messages
                                receivedAt: new Date(sentDate).toISOString(),
                                content: text.slice(0, 2000),
                              });
                              migratedCount++;
                              currentProcessed[uidKey] = true;
                              break;
                            }
                          }
                        }
                      } catch (error) {
                        console.error("Error processing IMAP email during migration:", error);
                      }
                      
                      resolveMsg();
                    });
                  });
                }
                
                // Save progress
                await saveProcessedImapUids(currentProcessed);
                imap.end();
                console.log(`Successfully migrated ${migratedCount} emails from IMAP`);
                resolve();
              });
            });
          } catch (error) {
            console.error("Error in migrateImapToEmailThreads:", error);
            imap.end();
            resolve();
          }
        });
        
        imap.on("error", (err) => {
          console.error("IMAP error during migration:", err);
          resolve();
        });
        
        imap.on("end", () => {
          resolve();
        });
      });
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
      
      // 이메일 스레드에 예약 요청 메시지 추가
      await saveOrUpdateEmailThread(email, record.id, {
        type: "reservation",
        sentAt: record.createdAt,
        date: record.date,
        time: record.time,
        concerns: record.concerns,
        id: record.id,
      });

      removeEmailVerification(email);

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
        
        // 이메일 스레드에 자동 회신 기록
        if (autoReplySent) {
          const autoReplyMsg = buildReservationAutoReply(record);
          await saveOrUpdateEmailThread(email, record.id, {
            type: "auto-reply",
            sentAt: new Date().toISOString(),
            content: autoReplyMsg.text,
          });
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
      
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ email, thread }));
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
      const patients = await readPatients();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ patients }));
    } catch (error) {
      console.error("Failed to load patients", error);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Failed to load patients" }));
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
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      ...(setCookieHeader ? { "Set-Cookie": setCookieHeader } : {}),
    });
    response.end(file);
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
