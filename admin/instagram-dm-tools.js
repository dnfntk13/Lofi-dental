(() => {
      const instagramPasteForm = document.getElementById("instagramPasteForm");
      const instagramSenderInput = document.getElementById("instagramSenderInput");
      const instagramPasteInput = document.getElementById("instagramPasteInput");
      const instagramPasteBtn = document.getElementById("instagramPasteBtn");
      const instagramPasteStatus = document.getElementById("instagramPasteStatus");
      const instagramCheckBtn = document.getElementById("instagramCheckBtn");
      const instagramCheckStatus = document.getElementById("instagramCheckStatus");
      const instagramCheckResults = document.getElementById("instagramCheckResults");
      function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"]/g, (char) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
        }[char]));
      }

      function renderInstagramCheck(check) {
        const threads = Array.isArray(check.threads) ? check.threads : [];
        if (!threads.length) {
          instagramCheckResults.innerHTML = '<p class="empty">No saved DM threads need review yet.</p>';
          return;
        }
        instagramCheckResults.innerHTML = threads.map((thread) => {
          const urgency = String(thread.urgency || "normal").toLowerCase();
          const missing = Array.isArray(thread.missingInfo) && thread.missingInfo.length
            ? `<div class="dm-check-meta">Missing: ${escapeHtml(thread.missingInfo.join(", "))}</div>`
            : "";
          const reply = thread.suggestedReply
            ? `<p class="dm-check-copy"><strong>Draft:</strong> ${escapeHtml(thread.suggestedReply)}</p>`
            : "";
          return `
            <article class="dm-check-card">
              <div class="dm-check-top">
                <span class="dm-check-sender">${escapeHtml(thread.sender || thread.target || "Instagram DM")}</span>
                <span class="dm-check-urgency ${escapeHtml(urgency)}">${escapeHtml(thread.shouldReply ? `reply · ${urgency}` : urgency)}</span>
              </div>
              <p class="dm-check-copy">${escapeHtml(thread.latestNeed || "No clear request detected.")}</p>
              ${missing}
              ${reply}
            </article>
          `;
        }).join("");
      }

      instagramCheckBtn.addEventListener("click", async () => {
        instagramCheckBtn.disabled = true;
        instagramCheckStatus.className = "import-status";
        instagramCheckStatus.textContent = "AI is checking Instagram DMs from the local reader...";
        instagramCheckResults.innerHTML = "";
        try {
          const response = await fetch("/api/admin/instagram-dms/check", {
            method: "POST",
            headers: { "Accept": "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.message || "Failed to check Instagram DMs.");
          const check = data.check || {};
          instagramCheckStatus.textContent = data.model ? `Checked reader DMs · ${data.model}` : "Checked reader DMs.";
          renderInstagramCheck(check);
          if (check.summary) instagramCheckStatus.textContent += " " + check.summary;
        } catch (error) {
          instagramCheckStatus.className = "import-status error";
          instagramCheckStatus.textContent = error.message || "Failed to check Instagram DMs.";
        } finally {
          instagramCheckBtn.disabled = false;
        }
      });

      instagramPasteForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const content = instagramPasteInput.value.trim();
        const senderId = instagramSenderInput.value.trim() || `pasted-${Date.now()}`;
        if (!content) {
          instagramPasteStatus.className = "import-status error";
          instagramPasteStatus.textContent = "Paste DM conversation text first.";
          return;
        }

        instagramPasteBtn.disabled = true;
        instagramPasteStatus.className = "import-status";
        instagramPasteStatus.textContent = "Saving pasted DM...";
        try {
          const response = await fetch("/api/admin/instagram-dms/import-screen", {
            method: "POST",
            headers: { "Accept": "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ senderId, content, capturedAt: new Date().toISOString() }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.message || "Failed to save pasted DM.");
          instagramPasteInput.value = "";
          instagramPasteStatus.textContent = "Saved. Ask AI to check Instagram DMs one by one.";
          instagramCheckBtn.click();
        } catch (error) {
          instagramPasteStatus.className = "import-status error";
          instagramPasteStatus.textContent = error.message || "Failed to save pasted DM.";
        } finally {
          instagramPasteBtn.disabled = false;
        }
      });
})();
