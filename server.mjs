import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const port = Number(process.env.PORT || 5173);
const adminUser = process.env.ADMIN_USER || "lofidental";
const adminPass = process.env.ADMIN_PASS || "Lofidental1!";
const adminSessionCookie = "admin_session";
const adminSessionValue = Buffer.from(`${adminUser}:${adminPass}`, "utf-8").toString("base64url");
const dataDir = path.join(rootDir, ".data");
const inboxPath = path.join(dataDir, "reservation-inbox.json");

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

async function readInbox() {
  try {
    const data = await readFile(inboxPath, "utf-8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeInbox(messages) {
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

createServer(async (request, response) => {
  const pathname = parsePathname(request.url);
  const basicAuthorized = isAuthorized(request);
  const sessionAuthorized = hasAdminSession(request);
  const adminAuthorized = basicAuthorized || sessionAuthorized;
  let setCookieHeader;

  if (pathname === "/api/reservations" && request.method === "POST") {
    try {
      const payload = await getJsonBody(request);
      const date = String(payload.date || "").trim();
      const time = String(payload.time || "").trim();
      const concerns = String(payload.concerns || "").trim();

      if (!date || !time || !concerns) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ message: "date, time, and concerns are required" }));
        return;
      }

      const inbox = await readInbox();
      const record = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date,
        time,
        concerns,
        createdAt: new Date().toISOString(),
      };

      inbox.unshift(record);
      await writeInbox(inbox);

      response.writeHead(201, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true }));
      return;
    } catch (error) {
      const isPayloadError = error instanceof Error && ["Invalid JSON", "Payload too large"].includes(error.message);
      response.writeHead(isPayloadError ? 400 : 500, {
        "Content-Type": "application/json; charset=utf-8",
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

    const inbox = await readInbox();
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ messages: inbox }));
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
