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

  let sessionId = savedSession.sessionId || "";
  let displayName = savedSession.displayName || "";
  let isOpen = false;

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

    .consult-chat-form {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      padding: 12px;
      border-top: 1px solid rgba(90, 111, 218, 0.16);
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
  panel.setAttribute("aria-label", "Consult with Dr. Kim chat");
  panel.innerHTML = `
    <div class="consult-chat-head">
      <span>Consult with Dr. Kim</span>
      <button class="consult-chat-close" type="button" aria-label="Close chat">×</button>
    </div>
    <div class="consult-chat-log" aria-live="polite"></div>
    <form class="consult-chat-form">
      <input class="consult-chat-input" type="text" maxlength="2000" autocomplete="off" placeholder="Type your message" />
      <button class="consult-chat-send" type="submit">Send</button>
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

  function saveSession() {
    localStorage.setItem(storageKey, JSON.stringify({ sessionId, displayName }));
  }

  function addMessage(text, type) {
    const message = document.createElement("div");
    message.className = `consult-chat-message ${type || "system"}`.trim();
    message.textContent = text;
    log.appendChild(message);
    log.scrollTop = log.scrollHeight;
  }

  function openChat() {
    isOpen = true;
    panel.classList.add("open");
    launch.setAttribute("aria-expanded", "true");
    if (!log.childElementCount) {
      addMessage("Hi, I am here to help. Share your concern, and if you include your name or phone number, we will save it with your patient profile.");
    }
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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = input.value.trim();
    if (!content) return;

    input.value = "";
    addMessage(content, "user");
    sendButton.disabled = true;

    try {
      const response = await fetch("/api/consult-chat", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId, displayName, content }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        addMessage(data.message || "Message could not be sent. Please try again.");
        return;
      }

      sessionId = data.sessionId || sessionId;
      displayName = data.displayName || displayName;
      saveSession();
      addMessage("Thank you. Your message has been sent to our team.");
    } catch {
      addMessage("Message could not be sent. Please check your connection and try again.");
    } finally {
      sendButton.disabled = false;
      input.focus();
    }
  });
})();
