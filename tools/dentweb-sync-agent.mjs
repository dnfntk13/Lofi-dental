import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=") || "1"];
}));

const serverUrl = (args.get("server") || process.env.LOFI_ADMIN_URL || "https://lofiesthetic.com").replace(/\/$/, "");
const adminUser = args.get("user") || process.env.ADMIN_USER || "lofidental";
const adminPass = args.get("pass") || process.env.ADMIN_PASS || "Lofidental1!";
const dryRun = args.has("dry-run") || process.env.DENTWEB_DRY_RUN === "1";
const skipPrompt = args.has("no-prompt") || process.env.DENTWEB_SKIP_PROMPT === "1";
const daemonMode = args.has("daemon") || process.env.DENTWEB_DAEMON === "1";
const agentPort = Number(args.get("agent-port") || process.env.DENTWEB_AGENT_PORT || 5175);
const windowPattern = args.get("window") || process.env.DENTWEB_WINDOW_PATTERN || "덴트웹|Dentweb|Dent Web";
const printClick = args.get("print-click") || process.env.DENTWEB_PRINT_CLICK || "136,539";
const pdfDir = args.get("pdf-dir") || process.env.DENTWEB_PDF_DIR || path.join(os.homedir(), "Downloads", "lofi-dentweb-sync");
const saveWaitMs = Number(args.get("save-wait-ms") || process.env.DENTWEB_SAVE_WAIT_MS || 45000);
const saveDialogPattern = args.get("save-dialog") || process.env.DENTWEB_SAVE_DIALOG_PATTERN || "Save Print Output As|다른 이름으로 저장|인쇄 출력|저장|PDF";
let syncInProgress = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseClickPoint(value) {
  const [x, y] = String(value || "").split(",").map((part) => Number(part.trim()));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("DENTWEB_PRINT_CLICK must be x,y window-relative coordinates");
  }
  return { x, y };
}

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || stdout || error.message).trim()));
        return;
      }
      resolve(String(stdout || "").trim());
    });
  });
}

async function clickDentwebPrintButton() {
  if (process.platform !== "win32") {
    throw new Error("Dentweb desktop sync can only run on the Windows computer where Dentweb is open");
  }

  const { x, y } = parseClickPoint(printClick);
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeMethods {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
"@
$pattern = ${JSON.stringify(windowPattern)}
$target = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match $pattern } | Select-Object -First 1
if (-not $target) { throw "Dentweb window not found. Open Dentweb, log in, and keep the reservation calendar visible." }
$hwnd = $target.MainWindowHandle
[NativeMethods]::ShowWindow($hwnd, 9) | Out-Null
Start-Sleep -Milliseconds 250
[NativeMethods]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Milliseconds 450
$rect = New-Object RECT
[NativeMethods]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$clickX = $rect.Left + ${Math.round(x)}
$clickY = $rect.Top + ${Math.round(y)}
[NativeMethods]::SetCursorPos($clickX, $clickY) | Out-Null
Start-Sleep -Milliseconds 120
[NativeMethods]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 80
[NativeMethods]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
[pscustomobject]@{ title = $target.MainWindowTitle; x = $clickX; y = $clickY } | ConvertTo-Json -Compress
`;
  const output = await runPowerShell(script);
  return output ? JSON.parse(output) : {};
}

async function trySavePdfDialog(filePath) {
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeMethods {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
$pattern = ${JSON.stringify(saveDialogPattern)}
$dialog = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match $pattern } | Select-Object -First 1
if (-not $dialog) { Write-Output '{"handled":false}'; exit 0 }
[NativeMethods]::ShowWindow($dialog.MainWindowHandle, 9) | Out-Null
Start-Sleep -Milliseconds 200
[NativeMethods]::SetForegroundWindow($dialog.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 300
Set-Clipboard -Value ${JSON.stringify(filePath)}
$shell = New-Object -ComObject WScript.Shell
$shell.SendKeys('^a')
Start-Sleep -Milliseconds 120
$shell.SendKeys('^v')
Start-Sleep -Milliseconds 120
$shell.SendKeys('{ENTER}')
[pscustomobject]@{ handled = $true; title = $dialog.MainWindowTitle } | ConvertTo-Json -Compress
`;
  const output = await runPowerShell(script);
  return output ? JSON.parse(output) : { handled: false };
}

async function listPdfFiles() {
  await mkdir(pdfDir, { recursive: true });
  const names = await readdir(pdfDir).catch(() => []);
  const files = [];
  for (const name of names) {
    if (!name.toLowerCase().endsWith(".pdf")) continue;
    const filePath = path.join(pdfDir, name);
    const info = await stat(filePath).catch(() => null);
    if (!info?.isFile()) continue;
    files.push({ filePath, mtimeMs: info.mtimeMs, size: info.size });
  }
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

async function waitForNewPdf(startTime, targetFilePath) {
  const startedAt = Date.now();
  let saveDialogTried = false;

  while (Date.now() - startedAt < saveWaitMs) {
    const files = await listPdfFiles();
    const recent = files.find((file) => file.mtimeMs >= startTime - 1000 && file.size > 0);
    if (recent) return recent.filePath;

    if (!saveDialogTried && Date.now() - startedAt > 1800) {
      saveDialogTried = true;
      await trySavePdfDialog(targetFilePath).catch(() => null);
    }

    await sleep(700);
  }

  throw new Error(`PDF was not created in ${pdfDir}. Check the print/save dialog or set DENTWEB_PDF_DIR to the folder Dentweb saves PDFs into.`);
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
  await mkdir(pdfDir, { recursive: true });

  if (prompt && !skipPrompt) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await rl.question("Dentweb open, logged in, and calendar visible? Press Enter to click 예약표출력 and sync. ");
    rl.close();
  }

  const startTime = Date.now();
  const targetFilePath = path.join(pdfDir, `dentweb-${new Date().toISOString().replace(/[:.]/g, "-")}.pdf`);
  const clickResult = await clickDentwebPrintButton();
  console.log(`Clicked Dentweb print button at ${clickResult.x},${clickResult.y}${clickResult.title ? ` in ${clickResult.title}` : ""}`);

  const pdfPath = await waitForNewPdf(startTime, targetFilePath);
  console.log(`Found PDF: ${pdfPath}`);
  const result = await uploadPdf(pdfPath);
  const summary = {
    dryRun: result.dryRun,
    parsed: result.parsed,
    imported: result.imported,
    skipped: result.skipped,
  };
  console.log(JSON.stringify(summary, null, 2));
  return { ...summary, pdfPath };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Private-Network": "true",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

async function startDaemon() {
  await mkdir(pdfDir, { recursive: true });

  const server = createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }

    const url = new URL(request.url || "/", `http://127.0.0.1:${agentPort}`);
    if (url.pathname === "/health") {
      sendJson(response, 200, { ok: true, syncInProgress, windowPattern, printClick, pdfDir, serverUrl, dryRun });
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
    console.log(`Dentweb desktop sync agent running at http://127.0.0.1:${agentPort}`);
    console.log("Keep Dentweb open, logged in, and showing the reservation calendar on this Windows computer.");
    console.log(`Using window pattern: ${windowPattern}`);
    console.log(`Using reservation print click: ${printClick}`);
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