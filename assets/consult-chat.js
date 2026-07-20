(function () {
  const storageKey = "lofiConsultChat";

  const appointmentButton = document.querySelector(".sticky-appointment");
  const consultTriggers = document.querySelectorAll("[data-consult-trigger]");
  if (!appointmentButton && !consultTriggers.length) return;

  const savedSession = (() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch {
      return {};
    }
  })();

  function createDeviceId() {
    const randomValue = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `device-${String(randomValue).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80)}`;
  }

  let sessionId = savedSession.sessionId || "";
  let displayName = savedSession.displayName || "";
  let deviceId = savedSession.deviceId || createDeviceId();
  let isOpen = false;
  let lastThreadSignature = "";

  const style = document.createElement("style");
  style.textContent = `
    body.lofi-floating-ctas {
      padding-bottom: 156px;
    }

    .consult-chat-launch {
      position: fixed;
      right: 28px;
      bottom: 88px;
      z-index: 21;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 46px;
      padding: 0 20px;
      border: 1px solid rgba(31, 45, 102, 0.16);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.96);
      color: #1f2d66;
      font: inherit;
      font-weight: 700;
      text-decoration: none;
      white-space: nowrap;
      box-shadow: 0 12px 24px rgba(31, 45, 102, 0.14);
      cursor: pointer;
      transition: transform 180ms ease, box-shadow 180ms ease;
    }

    .consult-chat-launch:hover {
      transform: translateY(-1px);
      box-shadow: 0 16px 30px rgba(31, 45, 102, 0.18);
    }

    .consult-chat-panel {
      position: fixed;
      right: 28px;
      bottom: 146px;
      z-index: 22;
      width: min(360px, calc(100vw - 36px));
      border: 1px solid rgba(90, 111, 218, 0.22);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.98);
      box-shadow: 0 20px 48px rgba(31, 45, 102, 0.18);
      overflow: hidden;
      transform: translateY(10px);
      opacity: 0;
      pointer-events: none;
      transition: opacity 180ms ease, transform 180ms ease;
    }

    .consult-chat-panel.open {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }

    .consult-chat-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(90, 111, 218, 0.16);
      color: #1f2d66;
      font-weight: 800;
    }

    .consult-chat-close {
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 1.2rem;
      line-height: 1;
      cursor: pointer;
    }

    .consult-chat-log {
      display: grid;
      gap: 8px;
      max-height: 280px;
      overflow: auto;
      padding: 14px 16px;
      color: #1f2d66;
      font-size: 0.95rem;
      line-height: 1.45;
    }

    .consult-chat-message {
      width: fit-content;
      max-width: 88%;
      padding: 9px 11px;
      border-radius: 14px;
      background: #eef3ff;
      white-space: pre-wrap;
    }

    .consult-chat-message.user {
      justify-self: end;
      background: #1f2d66;
      color: #fff;
    }

    .consult-chat-status {
      display: block;
      margin-top: 4px;
      font-size: 0.72rem;
      line-height: 1;
      opacity: 0.72;
      text-align: right;
    }

    .consult-chat-form {
      display: grid;
      gap: 8px;
      padding: 12px;
      border-top: 1px solid rgba(90, 111, 218, 0.16);
    }

    .consult-chat-tools,
    .consult-chat-row {
      display: grid;
      grid-template-columns: auto auto 1fr;
      gap: 8px;
      align-items: center;
    }

    .consult-chat-row {
      grid-template-columns: 1fr auto;
    }

    .consult-chat-tool {
      min-height: 34px;
      border: 1px solid rgba(90, 111, 218, 0.22);
      border-radius: 999px;
      padding: 0 10px;
      background: #fff;
      color: #1f2d66;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }

    .consult-chat-emoji-panel {
      display: none;
      grid-template-columns: repeat(8, 1fr);
      gap: 4px;
      padding: 8px;
      border: 1px solid rgba(90, 111, 218, 0.16);
      border-radius: 12px;
      background: #f8faff;
    }

    .consult-chat-emoji-panel.open {
      display: grid;
    }

    .consult-chat-emoji {
      min-height: 30px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      cursor: pointer;
      font-size: 1.1rem;
    }

    .consult-chat-attachment {
      min-width: 0;
      color: #5f688f;
      font-size: 0.82rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .consult-chat-photo {
      display: block;
      width: min(220px, 100%);
      margin-top: 8px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.28);
      background: rgba(255, 255, 255, 0.12);
    }

    .consult-chat-input {
      min-width: 0;
      min-height: 42px;
      border: 1px solid rgba(90, 111, 218, 0.22);
      border-radius: 12px;
      padding: 0 12px;
      color: #1f2d66;
      font: inherit;
      background: #fff;
    }

    .consult-chat-send {
      min-height: 42px;
      border: 0;
      border-radius: 12px;
      padding: 0 14px;
      background: #1f2d66;
      color: #fff;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }

    .consult-chat-send:disabled {
      opacity: 0.62;
      cursor: not-allowed;
    }

    @media (max-width: 640px) {
      body.lofi-floating-ctas {
        padding-bottom: 172px;
      }

      .consult-chat-launch {
        position: fixed;
        right: 18px;
        bottom: 84px;
        left: 18px;
        display: flex;
        width: auto;
        margin: 0;
        justify-content: center;
      }

      .sticky-appointment {
        position: fixed !important;
        right: 18px !important;
        bottom: 18px !important;
        left: 18px !important;
        display: flex;
        width: auto;
        margin: 0;
        justify-content: center;
      }

      .consult-chat-panel {
        right: 18px;
        bottom: 142px;
        left: 18px;
        width: auto;
      }
    }
  `;
  document.head.appendChild(style);

  if (appointmentButton) {
    document.body.classList.add("lofi-floating-ctas");
    document.body.appendChild(appointmentButton);
  }

  const launch = document.createElement("button");
  launch.type = "button";
  launch.className = "consult-chat-launch";
  launch.textContent = "Consult with us";
  launch.setAttribute("aria-expanded", "false");
  launch.setAttribute("aria-controls", "consultChatPanel");

  const panel = document.createElement("section");
  panel.className = "consult-chat-panel";
  panel.id = "consultChatPanel";
  panel.setAttribute("aria-label", "Live Chat with Dr.Ryan KIm. Please remain on the website for response.");
  panel.innerHTML = `
    <div class="consult-chat-head">
      <span>Live Chat with Dr.Ryan KIm. Please remain on the website for response.</span>
      <button class="consult-chat-close" type="button" aria-label="Close chat">×</button>
    </div>
    <div class="consult-chat-log" aria-live="polite"></div>
    <form class="consult-chat-form">
      <div class="consult-chat-tools">
        <button class="consult-chat-tool consult-chat-emoji-toggle" type="button" aria-label="Add emoji">☺</button>
        <button class="consult-chat-tool consult-chat-photo-button" type="button" aria-label="Add photo" title="Add photo">📷</button>
        <span class="consult-chat-attachment" aria-live="polite"></span>
        <input class="consult-chat-file" type="file" accept="image/*" hidden />
      </div>
      <div class="consult-chat-emoji-panel" aria-label="Emoji picker"></div>
      <div class="consult-chat-row">
        <input class="consult-chat-input" type="text" maxlength="2000" autocomplete="off" placeholder="Type your message" />
        <button class="consult-chat-send" type="submit">Send</button>
      </div>
    </form>
  `;

  if (appointmentButton) {
    document.body.appendChild(launch);
  }
  document.body.appendChild(panel);

  const closeButton = panel.querySelector(".consult-chat-close");
  const log = panel.querySelector(".consult-chat-log");
  const form = panel.querySelector(".consult-chat-form");
  const input = panel.querySelector(".consult-chat-input");
  const sendButton = panel.querySelector(".consult-chat-send");
  const emojiToggle = panel.querySelector(".consult-chat-emoji-toggle");
  const emojiPanel = panel.querySelector(".consult-chat-emoji-panel");
  const photoButton = panel.querySelector(".consult-chat-photo-button");
  const fileInput = panel.querySelector(".consult-chat-file");
  const attachmentLabel = panel.querySelector(".consult-chat-attachment");
  const emojis = ["😀", "😊", "🙏", "❤️", "👍", "✨", "🥹", "😄", "😬", "🦷", "📷", "✅", "🙌", "🤍", "😌", "🤝"];
  let pendingAttachment = null;

  function saveSession() {
    localStorage.setItem(storageKey, JSON.stringify({ sessionId, displayName, deviceId }));
  }

  saveSession();

  function addMessage(text, type, attachments = []) {
    const message = document.createElement("div");
    message.className = `consult-chat-message ${type || "system"}`.trim();
    if (text) {
      message.appendChild(document.createTextNode(text));
    }
    attachments.forEach((attachment) => {
      if (!String(attachment?.type || "").startsWith("image/") || !attachment.dataUrl) return;
      const image = document.createElement("img");
      image.className = "consult-chat-photo";
      image.src = attachment.dataUrl;
      image.alt = attachment.name || "Attached photo";
      message.appendChild(image);
    });
    log.appendChild(message);
    log.scrollTop = log.scrollHeight;
    return message;
  }

  function setMessageStatus(message, status) {
    let statusNode = message.querySelector(".consult-chat-status");
    if (!statusNode) {
      statusNode = document.createElement("span");
      statusNode.className = "consult-chat-status";
      message.appendChild(statusNode);
    }
    statusNode.textContent = status;
    log.scrollTop = log.scrollHeight;
  }

  function renderThread(thread) {
    const signature = JSON.stringify(thread.map((item) => ({
      type: item.type || "",
      content: item.content || "",
      receivedAt: item.receivedAt || "",
      sentAt: item.sentAt || "",
      attachments: Array.isArray(item.attachments) ? item.attachments.length : 0,
    })));
    if (signature === lastThreadSignature) return;
    lastThreadSignature = signature;
    log.innerHTML = "";
    thread.forEach((item) => {
      if (item.type === "customer-reply") {
        const message = addMessage(item.content || "", "user", item.attachments || []);
        setMessageStatus(message, "Read");
        return;
      }

      if (item.type === "admin-reply") {
        addMessage(item.content || "", "system", item.attachments || []);
      }
    });
  }

  async function restoreChat() {
    try {
      const params = new URLSearchParams();
      if (sessionId) params.set("sessionId", sessionId);
      if (deviceId) params.set("deviceId", deviceId);
      const response = await fetch(`/api/consult-chat?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) return;
      const data = await response.json().catch(() => ({}));
      if (data.sessionId) sessionId = data.sessionId;
      if (data.displayName) displayName = data.displayName;
      saveSession();
      renderThread(Array.isArray(data.thread) ? data.thread : []);
    } catch {
      // Keep the chat usable even if history cannot be restored.
    }
  }

  function startThreadPolling() {
    window.setInterval(() => {
      if (document.hidden) return;
      restoreChat();
    }, 8000);
  }

  function openChat() {
    isOpen = true;
    panel.classList.add("open");
    launch.setAttribute("aria-expanded", "true");
    input.focus();
  }

  function closeChat() {
    isOpen = false;
    panel.classList.remove("open");
    launch.setAttribute("aria-expanded", "false");
  }

  if (appointmentButton) {
    launch.addEventListener("click", () => {
      if (isOpen) closeChat();
      else openChat();
    });
  }

  consultTriggers.forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      openChat();
    });
  });

  closeButton.addEventListener("click", closeChat);

  emojiPanel.innerHTML = emojis.map((emoji) => `<button class="consult-chat-emoji" type="button">${emoji}</button>`).join("");
  emojiToggle.addEventListener("click", () => {
    emojiPanel.classList.toggle("open");
  });
  emojiPanel.addEventListener("click", (event) => {
    const button = event.target.closest(".consult-chat-emoji");
    if (!button) return;
    const start = input.selectionStart || input.value.length;
    const end = input.selectionEnd || start;
    input.value = `${input.value.slice(0, start)}${button.textContent}${input.value.slice(end)}`;
    input.focus();
    input.setSelectionRange(start + button.textContent.length, start + button.textContent.length);
    emojiPanel.classList.remove("open");
  });

  photoButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    pendingAttachment = null;
    attachmentLabel.textContent = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      attachmentLabel.textContent = "Choose an image file.";
      fileInput.value = "";
      return;
    }

    try {
      attachmentLabel.textContent = "Preparing photo...";
      pendingAttachment = await resizePhoto(file);
      attachmentLabel.textContent = pendingAttachment.name;
    } catch {
      attachmentLabel.textContent = "Photo is too large.";
      pendingAttachment = null;
    } finally {
      fileInput.value = "";
    }
  });

  function resizePhoto(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const image = new Image();
        image.onerror = reject;
        image.onload = () => {
          const maxSide = 1200;
          const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.76);
          if (dataUrl.length > 900000) {
            reject(new Error("Photo is too large"));
            return;
          }
          resolve({ name: file.name || "photo.jpg", type: "image/jpeg", dataUrl });
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = input.value.trim();
    const attachments = pendingAttachment ? [pendingAttachment] : [];
    if (!content && !attachments.length) return;

    input.value = "";
    pendingAttachment = null;
    attachmentLabel.textContent = "";
    const message = addMessage(content, "user", attachments);
    setMessageStatus(message, "Sending...");
    sendButton.disabled = true;

    try {
      const response = await fetch("/api/consult-chat", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId, displayName, deviceId, content, attachments }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessageStatus(message, data.message || "Not sent");
        return;
      }

      sessionId = data.sessionId || sessionId;
      displayName = data.displayName || displayName;
      saveSession();
      setMessageStatus(message, "Sent");
      window.setTimeout(() => setMessageStatus(message, "Read"), 900);
    } catch {
      setMessageStatus(message, "Not sent");
    } finally {
      sendButton.disabled = false;
      input.focus();
    }
  });

  restoreChat();
  startThreadPolling();
})();
