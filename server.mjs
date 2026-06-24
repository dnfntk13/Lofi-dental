import { createServer } from "node:http";
import { randomInt } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MongoClient } from "mongodb";
import nodemailer from "nodemailer";

const rootDir = process.cwd();
const port = Number(process.env.PORT || 5173);
const adminUser = process.env.ADMIN_USER || "lofidental";
const adminPass = process.env.ADMIN_PASS || "Lofidental1!";
const adminSessionCookie = "admin_session";
const adminSessionValue = Buffer.from(`${adminUser}:${adminPass}`, "utf-8").toString("base64url");
const dataDir = path.join(rootDir, ".data");
const inboxPath = path.join(dataDir, "reservation-inbox.json");
const mongoUri = process.env.MONGODB_URI || "";
const mongoDatabaseName = process.env.MONGODB_DB_NAME || "lofi-dental";
const mongoCollectionName = process.env.MONGODB_COLLECTION || "reservationMessages";
const smtpHost = process.env.SMTP_HOST || "";
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER || "";
const smtpPass = process.env.SMTP_PASS || "";
const smtpFrom = process.env.SMTP_FROM || smtpUser;
const reservationNotifyTo = process.env.RESERVATION_NOTIFY_TO || "";
const resendApiKey = process.env.RESEND_API_KEY || "";
const resendFrom = process.env.RESEND_FROM || smtpFrom;
const emailDnsServers = (process.env.EMAIL_DNS_SERVERS || "8.8.8.8,1.1.1.1")
  .split(",")
  .map((server) => server.trim())
  .filter(Boolean);
let inboxCollectionPromise;
const emailVerificationCodes = new Map();
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
    return "/index.html";
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
}

function createEmailVerificationCode(email) {
  cleanupEmailVerificationCodes();
  const code = String(randomInt(100000, 1000000));
  emailVerificationCodes.set(email, {
    code,
    expiresAt: Date.now() + emailVerificationTtlMs,
  });
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
  return {
    subject: "We received your reservation request | lofi dental",
    text: `Hello,

Thank you for contacting lofi dental.

We received your reservation request and will confirm your appointment as soon as possible.
Confirmation usually takes 1-2 hours.

Reservation details
Date: ${record.date}
Time: ${record.time}
Email: ${record.email}

Your message
${record.concerns}

lofi dental
49 Apgujeong-ro 28-gil, 3F, Gangnam-gu, Seoul
+82-70-7755-8823`,
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

  const mobileRedirectPath = getMobileRedirectPath(pathname);
  if (request.method === "GET" && isMobileRequest(request) && mobileRedirectPath && !requestUrl.searchParams.has("desktop")) {
    response.writeHead(302, {
      Location: mobileRedirectPath,
      "Cache-Control": "private, no-store",
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

      if (!isValidEmailVerificationCode(email, emailCode)) {
        response.writeHead(400, {
          "Content-Type": "application/json; charset=utf-8",
          ...reservationCorsHeaders,
        });
        response.end(JSON.stringify({ message: "Please enter the verification code sent to your email" }));
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

      let autoReplySent = false;
      let notificationSent = false;
      try {
        autoReplySent = await sendReservationAutoReply(record);
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

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!adminAuthorized) {
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
});
