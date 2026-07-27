import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=") || "1"];
}));

const dentwebUrl = args.get("url") || process.env.DENTWEB_URL || "https://www.dentweb.co.kr";
const printSelector = args.get("selector") || process.env.DENTWEB_PRINT_SELECTOR || "";
const serverUrl = (args.get("server") || process.env.LOFI_ADMIN_URL || "https://lofiesthetic.com").replace(/\/$/, "");
const adminUser = args.get("user") || process.env.ADMIN_USER || "lofidental";
const adminPass = args.get("pass") || process.env.ADMIN_PASS || "Lofidental1!";
const debuggingPort = Number(args.get("port") || process.env.DENTWEB_DEBUG_PORT || 9222);
const chromePath = args.get("chrome") || process.env.CHROME_PATH || findChromePath();
const profileDir = args.get("profile") || process.env.DENTWEB_CHROME_PROFILE || path.join(os.homedir(), ".lofi-dentweb-chrome");
const downloadDir = args.get("download-dir") || process.env.DENTWEB_DOWNLOAD_DIR || path.join(os.homedir(), "Downloads", "lofi-dentweb-sync");
const dryRun = args.has("dry-run") || process.env.DENTWEB_DRY_RUN === "1";
const skipPrompt = args.has("no-prompt") || process.env.DENTWEB_SKIP_PROMPT === "1";
const daemonMode = args.has("daemon") || process.env.DENTWEB_DAEMON === "1";
const agentPort = Number(args.get("agent-port") || process.env.DENTWEB_AGENT_PORT || 5175);
let syncInProgress = false;

function findChromePath() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "Application", "chrome.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "google-chrome",
    "chrome",
  ];
  return candidates.find((candidate) => candidate.includes(path.sep) ? existsSync(candidate) : true) || "chrome";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function waitForChrome() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      return await fetchJson(`http://127.0.0.1:${debuggingPort}/json/version`);
    } catch {
      await sleep(250);
    }
  }
  throw new Error("Chrome DevTools endpoint did not start");
}

function launchChrome() {
  const endpoint = `http://127.0.0.1:${debuggingPort}/json/version`;
  return fetch(endpoint)
    .then((response) => response.ok ? null : Promise.reject(new Error("not running")))
    .catch(() => {
      spawn(chromePath, [
        `--remote-debugging-port=${debuggingPort}`,
        `--user-data-dir=${profileDir}`,
        "--disable-popup-blocking",
        "--no-first-run",
        dentwebUrl,
      ], { detached: true, stdio: "ignore" }).unref();
    });
}

class CdpSession {
  constructor(wsUrl) {
    if (typeof WebSocket !== "function") {
      throw new Error("This script needs Node.js with global WebSocket support. Use Node 20.19 or newer.");
    }
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => this.handleMessage(event));
  }

  handleMessage(event) {
    const message = JSON.parse(event.data);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || "CDP command failed"));
      else resolve(message.result || {});
      return;
    }
    const callbacks = this.listeners.get(message.method) || [];
    callbacks.forEach((callback) => callback(message.params || {}));
  }

  on(method, callback) {
    const callbacks = this.listeners.get(method) || [];
    callbacks.push(callback);
    this.listeners.set(method, callbacks);
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId;
    this.nextId += 1;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(payload);
    });
  }

  close() {
    this.ws.close();
  }
}

async function getPageTarget() {
  await fetch(`http://127.0.0.1:${debuggingPort}/json/new?${encodeURIComponent(dentwebUrl)}`, { method: "PUT" }).catch(() => null);
  const targets = await fetchJson(`http://127.0.0.1:${debuggingPort}/json/list`);
  const pages = targets.filter((target) => target.type === "page" && target.webSocketDebuggerUrl);
  return pages.find((target) => target.url.includes("dentweb")) || pages[0];
}

async function getMostRecentPageTarget() {
  const targets = await fetchJson(`http://127.0.0.1:${debuggingPort}/json/list`);
  return targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
}

async function clickPrintButton(session) {
  const expression = `(() => {
    const selector = ${JSON.stringify(printSelector)};
    const labels = ['예약표 출력', '예약 출력', '출력', '인쇄', '프린트', 'PDF', 'pdf'];
    let element = selector ? document.querySelector(selector) : null;
    if (!element) {
      const candidates = [...document.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"]')];
      element = candidates.find((candidate) => {
        const text = [candidate.innerText, candidate.textContent, candidate.value, candidate.title, candidate.getAttribute('aria-label')]
          .filter(Boolean)
          .join(' ')
          .trim();
        return labels.some((label) => text.includes(label));
      });
    }
    if (!element) return { ok: false, message: 'Print button not found' };
    element.scrollIntoView({ block: 'center', inline: 'center' });
    element.click();
    return { ok: true, text: (element.innerText || element.value || element.title || element.getAttribute('aria-label') || '').trim() };
  })()`;
  const result = await session.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  const value = result?.result?.value;
  if (!value?.ok) throw new Error(value?.message || "Failed to click Dentweb print button");
  return value;
}

async function waitForDownload(session) {
  let downloadName = "";
  let downloadGuid = "";
  let completed = false;

  session.on("Browser.downloadWillBegin", (event) => {
    downloadGuid = event.guid;
    downloadName = event.suggestedFilename || "dentweb-reservations.pdf";
  });
  session.on("Browser.downloadProgress", (event) => {
    if (downloadGuid && event.guid === downloadGuid && event.state === "completed") completed = true;
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (completed && downloadName) {
      const filePath = path.join(downloadDir, downloadName);
      if (existsSync(filePath)) return filePath;
    }
    await sleep(500);
  }
  return "";
}

async function printPageToPdf(session) {
  const result = await session.send("Page.printToPDF", {
    printBackground: true,
    landscape: true,
    paperWidth: 11.69,
    paperHeight: 8.27,
    marginTop: 0.25,
    marginBottom: 0.25,
    marginLeft: 0.25,
    marginRight: 0.25,
  });
  const filePath = path.join(downloadDir, `dentweb-${new Date().toISOString().replace(/[:.]/g, "-")}.pdf`);
  await writeFile(filePath, Buffer.from(result.data, "base64"));
  return filePath;
}

async function uploadPdf(filePath) {
  const pdfBase64 = (await readFile(filePath)).toString("base64");
  const auth = Buffer.from(`${adminUser}:${adminPass}`, "utf-8").toString("base64");
  const response = await fetch(`${serverUrl}/api/admin/dentweb/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({ fileName: path.basename(filePath), pdfBase64, dryRun }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.textPreview ? `\nPDF text preview:\n${data.textPreview}` : "";
    throw new Error(`${data.message || `Upload failed with ${response.status}`}${detail}`);
  }
  return data;
}

async function runDentwebSync({ prompt = true } = {}) {
  await mkdir(downloadDir, { recursive: true });
  await launchChrome();
  await waitForChrome();

  const target = await getPageTarget();
  if (!target) throw new Error("No Chrome page target found");
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.send("Page.enable");
  await session.send("Runtime.enable");
  await session.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir, eventsEnabled: true });

  if (prompt && !skipPrompt) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await rl.question("Dentweb login and reservation table ready? Press Enter to click print and sync. ");
    rl.close();
  }

  const downloadPromise = waitForDownload(session);
  const clickResult = await clickPrintButton(session);
  console.log(`Clicked Dentweb print button${clickResult.text ? `: ${clickResult.text}` : ""}`);

  let pdfPath = await downloadPromise;
  if (!pdfPath) {
    await sleep(2500);
    const printTarget = await getMostRecentPageTarget();
    let printSession = session;
    if (printTarget?.id && printTarget.id !== target.id) {
      printSession = new CdpSession(printTarget.webSocketDebuggerUrl);
      await printSession.send("Page.enable");
    }
    pdfPath = await printPageToPdf(printSession);
    if (printSession !== session) printSession.close();
  }

  console.log(`Saved PDF: ${pdfPath}`);
  const result = await uploadPdf(pdfPath);
  const summary = {
    dryRun: result.dryRun,
    parsed: result.parsed,
    imported: result.imported,
    skipped: result.skipped,
  };
  console.log(JSON.stringify(summary, null, 2));
  session.close();
  return { ...summary, pdfPath };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

async function startDaemon() {
  await mkdir(downloadDir, { recursive: true });
  await launchChrome();
  await waitForChrome();

  const server = createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }

    const url = new URL(request.url || "/", `http://127.0.0.1:${agentPort}`);
    if (url.pathname === "/health") {
      sendJson(response, 200, { ok: true, syncInProgress, dentwebUrl, serverUrl, dryRun });
      return;
    }

    if (url.pathname === "/sync" && request.method === "POST") {
      if (syncInProgress) {
        sendJson(response, 409, { ok: false, message: "Dentweb sync is already running" });
        return;
      }

      syncInProgress = true;
      try {
        const result = await runDentwebSync({ prompt: false });
        sendJson(response, 200, { ok: true, ...result });
      } catch (error) {
        sendJson(response, 500, { ok: false, message: error.message || "Dentweb sync failed" });
      } finally {
        syncInProgress = false;
      }
      return;
    }

    sendJson(response, 404, { ok: false, message: "Not found" });
  });

  server.listen(agentPort, "127.0.0.1", () => {
    console.log(`Dentweb sync agent running at http://127.0.0.1:${agentPort}`);
    console.log("Open Dentweb in the launched Chrome profile and keep it logged in on the reservation table.");
  });
}

async function main() {
  if (daemonMode) {
    await startDaemon();
    return;
  }
  await runDentwebSync({ prompt: true });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});