const status = document.getElementById("status");

document.getElementById("openRemote").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://remotedesktop.google.com/access/" });
});

chrome.runtime.sendMessage({ channel: "lofi-dentweb-browser-controller", command: "status" }, (response) => {
  if (chrome.runtime.lastError) {
    status.className = "status error";
    status.textContent = chrome.runtime.lastError.message;
    return;
  }
  if (response?.connected) {
    status.className = "status ok";
    status.textContent = `Ready: ${response.tab?.title || "Chrome Remote Desktop"}`;
  } else {
    status.className = "status error";
    status.textContent = "Chrome Remote Desktop tab not found.";
  }
});
