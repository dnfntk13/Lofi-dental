import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";

function loadLocalEnvFile() {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if (!key || process.env[key] !== undefined) continue;
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // Local .env is optional.
  }
}

loadLocalEnvFile();

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=") || "1"];
}));

const serverUrl = (args.get("server") || process.env.LOFI_ADMIN_URL || "https://lofiesthetic.com").replace(/\/$/, "");
const adminUser = args.get("user") || process.env.ADMIN_USER || "lofidental";
const adminPass = args.get("pass") || process.env.ADMIN_PASS || "Lofidental1!";
const openaiApiKey = args.get("openai-key") || process.env.OPENAI_API_KEY || "";
const dentwebAiModel = args.get("ai-model") || process.env.DENTWEB_AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
const aiTask = args.get("task") || process.env.DENTWEB_AI_TASK || "";
const aiMode = args.has("ai") || Boolean(aiTask);
const aiApply = args.has("apply") || process.env.DENTWEB_AI_APPLY === "1";
const dryRun = args.has("dry-run") || process.env.DENTWEB_DRY_RUN === "1";
const skipPrompt = args.has("no-prompt") || process.env.DENTWEB_SKIP_PROMPT === "1";
const daemonMode = args.has("daemon") || process.env.DENTWEB_DAEMON === "1";
const agentPort = Number(args.get("agent-port") || process.env.DENTWEB_AGENT_PORT || 5175);
const windowPattern = args.get("window") || process.env.DENTWEB_WINDOW_PATTERN || "덴트웹|Dentweb|Dent Web";
const printButtonPattern = args.get("print-button") || process.env.DENTWEB_PRINT_BUTTON_PATTERN || "예약표출력|예약표 출력|예약 출력";
const printDialogPattern = args.get("print-dialog") || process.env.DENTWEB_PRINT_DIALOG_PATTERN || "예약표 출력|예약표출력";
const printConfirmPattern = args.get("print-confirm") || process.env.DENTWEB_PRINT_CONFIRM_PATTERN || "^출력$|인쇄|확인";
const printClick = args.get("print-click") || process.env.DENTWEB_PRINT_CLICK || "136,539";
const pdfDir = args.get("pdf-dir") || process.env.DENTWEB_PDF_DIR || path.join(os.homedir(), "Downloads", "lofi-dentweb-sync");
const screenshotDir = args.get("screenshot-dir") || process.env.DENTWEB_SCREENSHOT_DIR || pdfDir;
const screenshotDelayMs = Number(args.get("screenshot-delay-ms") || process.env.DENTWEB_SCREENSHOT_DELAY_MS || 1500);
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

function getJsonBody(request, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) reject(new Error("Payload too large"));
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

async function focusDentwebWindow() {
  if (process.platform !== "win32") {
    throw new Error("PC AI can only control Dentweb on the Windows computer where Dentweb is open");
  }

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeMethods {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
}
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
"@
$pattern = ${JSON.stringify(windowPattern)}
$target = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match $pattern } | Sort-Object ProcessName | Select-Object -First 1
if (-not $target) { throw "Dentweb window not found. Open Dentweb, log in, and keep the reservation calendar visible." }
$hwnd = $target.MainWindowHandle
[NativeMethods]::ShowWindow($hwnd, 9) | Out-Null
Start-Sleep -Milliseconds 250
[NativeMethods]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Milliseconds 500
$rect = New-Object RECT
[NativeMethods]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
[pscustomobject]@{ title = $target.MainWindowTitle; left = $rect.Left; top = $rect.Top; right = $rect.Right; bottom = $rect.Bottom } | ConvertTo-Json -Compress
`;
  const output = await runPowerShell(script);
  return output ? JSON.parse(output) : {};
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
Add-Type -AssemblyName UIAutomationClient
$pattern = ${JSON.stringify(windowPattern)}
$buttonPattern = ${JSON.stringify(printButtonPattern)}
$target = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match $pattern } | Select-Object -First 1
if (-not $target) { throw "Dentweb window not found. Open Dentweb, log in, and keep the reservation calendar visible." }
$hwnd = $target.MainWindowHandle
[NativeMethods]::ShowWindow($hwnd, 9) | Out-Null
Start-Sleep -Milliseconds 250
[NativeMethods]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Milliseconds 450
$root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
$allDescendants = [System.Windows.Automation.TreeScope]::Descendants
$allElements = $root.FindAll($allDescendants, [System.Windows.Automation.Condition]::TrueCondition)
for ($i = 0; $i -lt $allElements.Count; $i++) {
  $element = $allElements.Item($i)
  $name = [string]$element.Current.Name
  $automationId = [string]$element.Current.AutomationId
  $className = [string]$element.Current.ClassName
  $label = "$name $automationId $className".Trim()
  if ($label -match $buttonPattern) {
    try {
      $invoke = $element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
      $invoke.Invoke()
      [pscustomobject]@{ title = $target.MainWindowTitle; method = "uia"; button = $name; automationId = $automationId; className = $className } | ConvertTo-Json -Compress
      exit 0
    } catch {
      $rectButton = $element.Current.BoundingRectangle
      if (-not $rectButton.IsEmpty -and $rectButton.Width -gt 1 -and $rectButton.Height -gt 1) {
        $centerX = [int]($rectButton.Left + ($rectButton.Width / 2))
        $centerY = [int]($rectButton.Top + ($rectButton.Height / 2))
        [NativeMethods]::SetCursorPos($centerX, $centerY) | Out-Null
        Start-Sleep -Milliseconds 120
        [NativeMethods]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds 80
        [NativeMethods]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
        [pscustomobject]@{ title = $target.MainWindowTitle; method = "uia-bounds"; button = $name; automationId = $automationId; className = $className; x = $centerX; y = $centerY } | ConvertTo-Json -Compress
        exit 0
      }
    }
  }
}
$rect = New-Object RECT
[NativeMethods]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$clickX = $rect.Left + ${Math.round(x)}
$clickY = $rect.Top + ${Math.round(y)}
[NativeMethods]::SetCursorPos($clickX, $clickY) | Out-Null
Start-Sleep -Milliseconds 120
[NativeMethods]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 80
[NativeMethods]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
[pscustomobject]@{ title = $target.MainWindowTitle; method = "coordinate"; x = $clickX; y = $clickY } | ConvertTo-Json -Compress
`;
  const output = await runPowerShell(script);
  return output ? JSON.parse(output) : {};
}

async function clickDentwebPrintDialogButton() {
  if (process.platform !== "win32") return { handled: false };

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeMethods {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@
Add-Type -AssemblyName UIAutomationClient
$dialogPattern = ${JSON.stringify(printDialogPattern)}
$buttonPattern = ${JSON.stringify(printConfirmPattern)}
$deadline = (Get-Date).AddSeconds(8)
while ((Get-Date) -lt $deadline) {
  $dialog = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match $dialogPattern } | Select-Object -First 1
  if ($dialog) {
    [NativeMethods]::ShowWindow($dialog.MainWindowHandle, 9) | Out-Null
    Start-Sleep -Milliseconds 200
    [NativeMethods]::SetForegroundWindow($dialog.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 250
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($dialog.MainWindowHandle)
    $elements = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    for ($i = 0; $i -lt $elements.Count; $i++) {
      $element = $elements.Item($i)
      $name = [string]$element.Current.Name
      $automationId = [string]$element.Current.AutomationId
      $className = [string]$element.Current.ClassName
      $label = "$name $automationId $className".Trim()
      if ($label -match $buttonPattern) {
        try {
          $invoke = $element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
          $invoke.Invoke()
          [pscustomobject]@{ handled = $true; method = "uia"; dialog = $dialog.MainWindowTitle; button = $name; automationId = $automationId; className = $className } | ConvertTo-Json -Compress
          exit 0
        } catch {
          $rect = $element.Current.BoundingRectangle
          if (-not $rect.IsEmpty -and $rect.Width -gt 1 -and $rect.Height -gt 1) {
            $centerX = [int]($rect.Left + ($rect.Width / 2))
            $centerY = [int]($rect.Top + ($rect.Height / 2))
            [NativeMethods]::SetCursorPos($centerX, $centerY) | Out-Null
            Start-Sleep -Milliseconds 120
            [NativeMethods]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
            Start-Sleep -Milliseconds 80
            [NativeMethods]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
            [pscustomobject]@{ handled = $true; method = "uia-bounds"; dialog = $dialog.MainWindowTitle; button = $name; automationId = $automationId; className = $className; x = $centerX; y = $centerY } | ConvertTo-Json -Compress
            exit 0
          }
        }
      }
    }
  }
  Start-Sleep -Milliseconds 350
}
[pscustomobject]@{ handled = $false; message = "Dentweb print dialog not found" } | ConvertTo-Json -Compress
`;
  const output = await runPowerShell(script);
  return output ? JSON.parse(output) : { handled: false };
}

async function captureFullScreenScreenshot() {
  if (process.platform !== "win32") {
    throw new Error("Full-screen screenshot capture is only supported on Windows");
  }

  await mkdir(screenshotDir, { recursive: true });
  const screenshotPath = path.join(screenshotDir, `dentweb-screen-${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bounds.Size)
$bitmap.Save(${JSON.stringify(screenshotPath)}, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
[pscustomobject]@{ path = ${JSON.stringify(screenshotPath)}; width = $bounds.Width; height = $bounds.Height } | ConvertTo-Json -Compress
`;
  const output = await runPowerShell(script);
  return output ? JSON.parse(output) : { path: screenshotPath };
}

function extractJsonObject(content) {
  const text = String(content || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI did not return JSON");
    return JSON.parse(match[0]);
  }
}

function normalizeAiMessages(value) {
  return (Array.isArray(value) ? value : [])
    .map((message) => ({
      role: message?.role === "assistant" ? "assistant" : "user",
      content: String(message?.content || "").trim(),
    }))
    .filter((message) => message.content)
    .slice(-12);
}

function normalizeDesktopAction(action) {
  const next = action && typeof action === "object" ? { ...action } : { action: "wait" };
  next.action = String(next.action || "wait").toLowerCase();
  if (next.action === "doubleclick") next.action = "double_click";
  if (next.action === "rightclick") next.action = "right_click";
  if (next.action === "elementclick") next.action = "element_click";
  if (next.action === "elementtype") next.action = "element_type";
  if (!["element_click", "element_type", "click", "double_click", "right_click", "drag", "scroll", "type", "key", "wait", "done"].includes(next.action)) next.action = "wait";
  return next;
}

async function getForegroundWindowInfo() {
  if (process.platform !== "win32") {
    throw new Error("PC AI desktop control can only run on the Windows computer where the agent is open");
  }

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class NativeMethods {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
}
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
"@
$handle = [NativeMethods]::GetForegroundWindow()
if ($handle -eq [IntPtr]::Zero) { throw "No foreground window found." }
$titleBuilder = New-Object System.Text.StringBuilder 512
[NativeMethods]::GetWindowText($handle, $titleBuilder, $titleBuilder.Capacity) | Out-Null
$rect = New-Object RECT
[NativeMethods]::GetWindowRect($handle, [ref]$rect) | Out-Null
[pscustomobject]@{ title = $titleBuilder.ToString(); left = $rect.Left; top = $rect.Top; right = $rect.Right; bottom = $rect.Bottom } | ConvertTo-Json -Compress
`;
  const output = await runPowerShell(script);
  return output ? JSON.parse(output) : { title: "" };
}

async function getForegroundUiElements() {
  if (process.platform !== "win32") return [];

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$window = [System.Windows.Automation.AutomationElement]::FocusedElement
while ($window -and $window.Current.ControlType.ProgrammaticName -ne 'ControlType.Window') {
  $window = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($window)
}
if (-not $window) { $window = [System.Windows.Automation.AutomationElement]::RootElement }
$condition = [System.Windows.Automation.Condition]::TrueCondition
$elements = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
$items = New-Object System.Collections.Generic.List[object]
$index = 0
foreach ($element in $elements) {
  if ($items.Count -ge 160) { break }
  $rect = $element.Current.BoundingRectangle
  if ($rect.Width -lt 2 -or $rect.Height -lt 2) { continue }
  $name = [string]$element.Current.Name
  $automationId = [string]$element.Current.AutomationId
  $controlType = ([string]$element.Current.ControlType.ProgrammaticName).Replace('ControlType.', '')
  $className = [string]$element.Current.ClassName
  if ([string]::IsNullOrWhiteSpace($name) -and [string]::IsNullOrWhiteSpace($automationId) -and $controlType -notmatch 'Button|Edit|ComboBox|List|Tab|Menu|Calendar|DataGrid|Document|Pane') { continue }
  $items.Add([pscustomobject]@{
    id = $index
    name = $name
    automationId = $automationId
    controlType = $controlType
    className = $className
    x = [Math]::Round($rect.X)
    y = [Math]::Round($rect.Y)
    width = [Math]::Round($rect.Width)
    height = [Math]::Round($rect.Height)
  })
  $index++
}
$items | ConvertTo-Json -Compress -Depth 4
`;

  try {
    const output = await runPowerShell(script);
    const parsed = output ? JSON.parse(output) : [];
    return Array.isArray(parsed) ? parsed : [parsed].filter(Boolean);
  } catch {
    return [];
  }
}

function summarizeUiElements(elements) {
  return (Array.isArray(elements) ? elements : [])
    .slice(0, 120)
    .map((element) => [
      `#${element.id}`,
      element.controlType || "Element",
      element.name ? `name=${JSON.stringify(element.name).slice(0, 90)}` : "",
      element.automationId ? `automationId=${JSON.stringify(element.automationId).slice(0, 70)}` : "",
      `rect=${element.x},${element.y},${element.width},${element.height}`,
    ].filter(Boolean).join(" "))
    .join("\n");
}

async function askDentwebAi(task, screenshot) {
  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required for Dentweb AI control");
  }

  const imageBase64 = (await readFile(screenshot.path)).toString("base64");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: dentwebAiModel,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are controlling the Dentweb desktop program on the user's clinic PC.",
            "Read the screenshot and choose exactly one next action toward the user's task.",
            "Return only JSON with keys: action, x, y, text, key, reason.",
            "Allowed actions: click, type, key, wait, done.",
            "Use absolute screen coordinates for click actions.",
            "For type actions, provide the exact text to paste into the currently focused field.",
            "Do not type passwords, delete records, cancel appointments, or submit irreversible changes.",
            "If the next step is unclear or risky, return action wait with a short reason.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Task: ${task}\nScreenshot size: ${screenshot.width || "unknown"}x${screenshot.height || "unknown"}` },
            { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } },
          ],
        },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenAI request failed with ${response.status}`);
  }
  const content = data?.choices?.[0]?.message?.content || "";
  return normalizeDesktopAction(extractJsonObject(content));
}

async function askPcAiChat(messages, screenshot, { uiElements = [], pageContext = null } = {}) {
  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required for PC AI control");
  }

  const conversation = normalizeAiMessages(messages);
  if (!conversation.length) throw new Error("PC AI message is required");

  const imageBase64 = (await readFile(screenshot.path)).toString("base64");
  const lastMessage = conversation[conversation.length - 1];
  const priorMessages = conversation.slice(0, -1).map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: dentwebAiModel,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are PC AI for lofi esthetic dentistry staff on the clinic Windows PC.",
            "You can talk normally with staff and inspect the current full desktop screenshot, visible UI element tree, and any provided app context.",
            "Understand the screen semantically first: for example, a calendar is dates, time slots, reservations, selected days, and patient events, not just colored boxes.",
            "Prefer semantic UI actions using element_click or element_type with elementId from the UI element list. Use raw coordinates only when no suitable element exists.",
            "Choose exactly one small next PC action at a time, like a careful human assistant using the mouse and keyboard.",
            "Return only JSON with keys: reply, action.",
            "reply is a concise natural-language chat answer in the user's language.",
            "action is an object with keys: action, elementId, x, y, toX, toY, deltaY, text, key, reason.",
            "Allowed action values: element_click, element_type, click, double_click, right_click, drag, scroll, type, key, wait, done.",
            "Use absolute screen coordinates for mouse actions. For scroll, positive deltaY means scroll down.",
            "For type actions, provide the exact text to paste into the currently focused field.",
            "Do not type passwords, payment details, secrets, or medical record content unless the staff explicitly provides that exact text in the current chat.",
            "Do not delete records, cancel appointments, submit irreversible changes, purchase anything, send messages, or publish content without explicit staff confirmation in the current chat.",
            "If no PC operation is needed, use action wait or done.",
            "If the next operation is unclear or risky, use action wait and explain the concern in reply.",
          ].join(" "),
        },
        ...priorMessages,
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                lastMessage.content,
                `Screenshot size: ${screenshot.width || "unknown"}x${screenshot.height || "unknown"}`,
                `Visible UI elements:\n${summarizeUiElements(uiElements) || "No accessible UI elements were captured."}`,
                pageContext ? `App context JSON:\n${JSON.stringify(pageContext).slice(0, 14000)}` : "App context JSON: none",
              ].join("\n\n"),
            },
            { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } },
          ],
        },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenAI request failed with ${response.status}`);
  }
  const content = data?.choices?.[0]?.message?.content || "";
  const result = extractJsonObject(content);
  return {
    reply: String(result.reply || "").trim() || "I checked the PC screen.",
    action: normalizeDesktopAction(result.action),
  };
}

function getUiElementCenter(action, uiElements) {
  const elementId = Number(action?.elementId);
  if (!Number.isInteger(elementId)) throw new Error("AI element action requires elementId");
  const element = (Array.isArray(uiElements) ? uiElements : []).find((item) => Number(item.id) === elementId);
  if (!element) throw new Error(`UI element ${elementId} was not found in the current screen context`);
  return {
    element,
    x: Number(element.x) + Number(element.width) / 2,
    y: Number(element.y) + Number(element.height) / 2,
  };
}

async function invokeUiElement(element) {
  if (process.platform !== "win32") return { invoked: false, reason: "not windows" };
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$targetName = ${JSON.stringify(String(element?.name || ""))}
$targetAutomationId = ${JSON.stringify(String(element?.automationId || ""))}
$targetControlType = ${JSON.stringify(String(element?.controlType || ""))}
$targetX = ${Math.round(Number(element?.x || 0))}
$targetY = ${Math.round(Number(element?.y || 0))}
$targetWidth = ${Math.round(Number(element?.width || 0))}
$targetHeight = ${Math.round(Number(element?.height || 0))}
$window = [System.Windows.Automation.AutomationElement]::FocusedElement
while ($window -and $window.Current.ControlType.ProgrammaticName -ne 'ControlType.Window') {
  $window = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($window)
}
if (-not $window) { throw "No focused window found." }
$elements = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
$match = $null
foreach ($candidate in $elements) {
  $rect = $candidate.Current.BoundingRectangle
  $name = [string]$candidate.Current.Name
  $automationId = [string]$candidate.Current.AutomationId
  $controlType = ([string]$candidate.Current.ControlType.ProgrammaticName).Replace('ControlType.', '')
  $idMatches = -not [string]::IsNullOrWhiteSpace($targetAutomationId) -and $automationId -eq $targetAutomationId
  $nameMatches = -not [string]::IsNullOrWhiteSpace($targetName) -and $name -eq $targetName -and $controlType -eq $targetControlType
  $rectMatches = [Math]::Abs($rect.X - $targetX) -le 8 -and [Math]::Abs($rect.Y - $targetY) -le 8 -and [Math]::Abs($rect.Width - $targetWidth) -le 12 -and [Math]::Abs($rect.Height - $targetHeight) -le 12
  if (($idMatches -or $nameMatches) -and ($rectMatches -or $idMatches)) { $match = $candidate; break }
}
if (-not $match) { Write-Output '{"invoked":false,"reason":"element not found"}'; exit 0 }
$pattern = $null
if ($match.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
  $pattern.Invoke()
  Write-Output '{"invoked":true,"method":"InvokePattern"}'
  exit 0
}
try {
  $match.SetFocus()
  Write-Output '{"invoked":false,"focused":true,"reason":"no InvokePattern"}'
} catch {
  Write-Output '{"invoked":false,"focused":false,"reason":"no InvokePattern"}'
}
`;

  try {
    const output = await runPowerShell(script);
    return output ? JSON.parse(output) : { invoked: false };
  } catch (error) {
    return { invoked: false, reason: error.message || "UI Automation invoke failed" };
  }
}

async function executeDesktopAction(action, { requireDentwebFocus = true, uiElements = [] } = {}) {
  const type = String(action?.action || "").toLowerCase();
  if (!["element_click", "element_type", "click", "double_click", "right_click", "drag", "scroll", "type", "key", "wait", "done"].includes(type)) {
    throw new Error(`Unsupported AI action: ${type}`);
  }
  if (type === "wait" || type === "done") return { executed: false, action: type };
  if (type === "element_click" || type === "element_type") {
    const target = getUiElementCenter(action, uiElements);
    const invokeResult = await invokeUiElement(target.element);
    const clickResult = invokeResult.invoked
      ? { executed: true, action: "invoke", invokeResult }
      : await executeDesktopAction({ action: "click", x: target.x, y: target.y }, { requireDentwebFocus: false, uiElements });
    if (type === "element_click") return { ...clickResult, action: type, element: target.element, invokeResult };
    const typeResult = await executeDesktopAction({ action: "type", text: action.text }, { requireDentwebFocus: false, uiElements });
    return { executed: true, action: type, element: target.element, invokeResult, click: clickResult, type: typeResult };
  }


  const focusedWindow = requireDentwebFocus ? await focusDentwebWindow() : await getForegroundWindowInfo();

  if (["click", "double_click", "right_click"].includes(type)) {
    const x = Number(action.x);
    const y = Number(action.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("AI click action requires x and y");
    const isRightClick = type === "right_click";
    const clickCount = type === "double_click" ? 2 : 1;
    const downFlag = isRightClick ? "0x0008" : "0x0002";
    const upFlag = isRightClick ? "0x0010" : "0x0004";
    const script = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeMethods {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@
[NativeMethods]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null
for ($index = 0; $index -lt ${clickCount}; $index++) {
  Start-Sleep -Milliseconds 80
  [NativeMethods]::mouse_event(${downFlag}, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 60
  [NativeMethods]::mouse_event(${upFlag}, 0, 0, 0, [UIntPtr]::Zero)
}
`;
    await runPowerShell(script);
    return { executed: true, action: type, x, y, focusedWindow };
  }

  if (type === "drag") {
    const x = Number(action.x);
    const y = Number(action.y);
    const toX = Number(action.toX);
    const toY = Number(action.toY);
    if (![x, y, toX, toY].every(Number.isFinite)) throw new Error("AI drag action requires x, y, toX, and toY");
    const script = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeMethods {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@
[NativeMethods]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null
Start-Sleep -Milliseconds 80
[NativeMethods]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 120
[NativeMethods]::SetCursorPos(${Math.round(toX)}, ${Math.round(toY)}) | Out-Null
Start-Sleep -Milliseconds 120
[NativeMethods]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
`;
    await runPowerShell(script);
    return { executed: true, action: type, x, y, toX, toY, focusedWindow };
  }

  if (type === "scroll") {
    const x = Number.isFinite(Number(action.x)) ? Number(action.x) : null;
    const y = Number.isFinite(Number(action.y)) ? Number(action.y) : null;
    const deltaY = Number.isFinite(Number(action.deltaY)) ? Number(action.deltaY) : 700;
    const wheelDelta = -Math.round(deltaY);
    const script = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeMethods {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, int dwData, UIntPtr dwExtraInfo);
}
"@
${x !== null && y !== null ? `[NativeMethods]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null` : ""}
Start-Sleep -Milliseconds 80
[NativeMethods]::mouse_event(0x0800, 0, 0, ${wheelDelta}, [UIntPtr]::Zero)
`;
    await runPowerShell(script);
    return { executed: true, action: type, x, y, deltaY, focusedWindow };
  }

  if (type === "type") {
    const text = String(action.text || "");
    if (!text) throw new Error("AI type action requires text");
    if (/password|비밀번호|암호/i.test(text)) throw new Error("Refusing to type password-like text");
    const script = `
$ErrorActionPreference = 'Stop'
Set-Clipboard -Value ${JSON.stringify(text)}
$shell = New-Object -ComObject WScript.Shell
$shell.SendKeys('^v')
`;
    await runPowerShell(script);
    return { executed: true, action: type, textLength: text.length, focusedWindow };
  }

  const key = String(action.key || "").trim();
  const allowedKeys = new Set(["{TAB}", "{ENTER}", "{ESC}", "{UP}", "{DOWN}", "{LEFT}", "{RIGHT}", "{HOME}", "{END}", "{PGUP}", "{PGDN}", "{BACKSPACE}", "{DELETE}", "^a", "^c", "^v", "^x", "^z", "^y", "^f", "^l", "^s"]);
  if (!allowedKeys.has(key)) throw new Error(`Unsupported key action: ${key}`);
  const script = `
$ErrorActionPreference = 'Stop'
$shell = New-Object -ComObject WScript.Shell
$shell.SendKeys(${JSON.stringify(key)})
`;
  await runPowerShell(script);
  return { executed: true, action: type, key, focusedWindow };
}

async function runDentwebAiStep(task, { apply = false } = {}) {
  if (!task) throw new Error("Dentweb AI task is required");
  await mkdir(screenshotDir, { recursive: true });
  const focusedWindow = await focusDentwebWindow();
  const screenshot = await captureFullScreenScreenshot();
  const action = await askDentwebAi(task, screenshot);
  const execution = apply ? await executeDesktopAction(action, { requireDentwebFocus: true }) : { executed: false, preview: true };
  return { ok: true, task, screenshotPath: screenshot.path, focusedWindow, action, execution };
}

async function runPcAiChat(messages, { apply = false, pageContext = null } = {}) {
  await mkdir(screenshotDir, { recursive: true });
  const focusedWindow = await getForegroundWindowInfo();
  const uiElements = await getForegroundUiElements();
  const screenshot = await captureFullScreenScreenshot();
  const result = await askPcAiChat(messages, screenshot, { uiElements, pageContext });
  const execution = apply ? await executeDesktopAction(result.action, { requireDentwebFocus: false, uiElements }) : { executed: false, preview: true };
  return { ok: true, screenshotPath: screenshot.path, focusedWindow, uiElementCount: uiElements.length, reply: result.reply, action: result.action, execution };
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
  const clickDescription = clickResult.method === "uia"
    ? `button "${clickResult.button}"`
    : `coordinates ${clickResult.x},${clickResult.y}`;
  console.log(`Clicked Dentweb print by ${clickDescription}${clickResult.title ? ` in ${clickResult.title}` : ""}`);

  const dialogResult = await clickDentwebPrintDialogButton();
  if (dialogResult.handled) {
    const dialogDescription = dialogResult.method === "uia"
      ? `button "${dialogResult.button}"`
      : `button "${dialogResult.button}" at ${dialogResult.x},${dialogResult.y}`;
    console.log(`Clicked Dentweb print dialog by ${dialogDescription}${dialogResult.dialog ? ` in ${dialogResult.dialog}` : ""}`);
  } else {
    console.log(dialogResult.message || "Dentweb print dialog was not found; waiting for PDF anyway.");
  }

  await sleep(screenshotDelayMs);
  const screenshot = await captureFullScreenScreenshot();
  console.log(`Saved Dentweb screen screenshot: ${screenshot.path}`);

  let result = { dryRun, parsed: 0, imported: 0, skipped: 0 };
  let pdfPath = "";
  try {
    pdfPath = await waitForNewPdf(startTime, targetFilePath);
    console.log(`Found PDF: ${pdfPath}`);
    result = await uploadPdf(pdfPath);
  } catch (error) {
    console.log(`PDF upload skipped: ${error.message || error}`);
  }
  const summary = {
    dryRun: result.dryRun,
    parsed: result.parsed,
    imported: result.imported,
    skipped: result.skipped,
    screenshotPath: screenshot.path,
    pdfPath,
  };
  console.log(JSON.stringify(summary, null, 2));
  return summary;
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
      sendJson(response, 200, { ok: true, syncInProgress, windowPattern, printButtonPattern, printDialogPattern, printConfirmPattern, printClick, pdfDir, screenshotDir, serverUrl, dryRun });
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

    if (url.pathname === "/ai-step" && request.method === "POST") {
      if (syncInProgress) {
        sendJson(response, 409, { ok: false, message: "Dentweb sync is already running" });
        return;
      }

      try {
        const payload = await getJsonBody(request);
        const task = String(payload.task || "").trim();
        const apply = Boolean(payload.apply);
        const result = await runDentwebAiStep(task, { apply });
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, 500, { ok: false, message: error.message || "Dentweb AI step failed" });
      }
      return;
    }

    if (url.pathname === "/pc-ai-chat" && request.method === "POST") {
      if (syncInProgress) {
        sendJson(response, 409, { ok: false, message: "Dentweb sync is already running" });
        return;
      }

      try {
        const payload = await getJsonBody(request);
        const apply = Boolean(payload.apply);
        const result = await runPcAiChat(payload.messages, { apply, pageContext: payload.pageContext || null });
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, 500, { ok: false, message: error.message || "PC AI chat failed" });
      }
      return;
    }

    sendJson(response, 404, { ok: false, message: "Not found" });
  });

  server.listen(agentPort, "127.0.0.1", () => {
    console.log(`Dentweb desktop sync agent running at http://127.0.0.1:${agentPort}`);
    console.log("Keep Dentweb open, logged in, and showing the reservation calendar on this Windows computer.");
    console.log(`Using window pattern: ${windowPattern}`);
    console.log(`Using reservation print button pattern: ${printButtonPattern}`);
    console.log(`Using print dialog pattern: ${printDialogPattern}`);
    console.log(`Using print confirm button pattern: ${printConfirmPattern}`);
    console.log(`Fallback reservation print click: ${printClick}`);
    console.log(`Saving screenshots to: ${screenshotDir}`);
    console.log("PC AI endpoint: POST /pc-ai-chat with { messages, apply }");
    console.log("Legacy Dentweb AI endpoint: POST /ai-step with { task, apply }");
  });
}

async function main() {
  if (daemonMode) {
    await startDaemon();
    return;
  }
  if (aiMode) {
    const result = await runDentwebAiStep(aiTask, { apply: aiApply });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  await runDentwebSync({ prompt: true });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});