# Lofi Dentweb Browser Controller

This Chrome extension lets the Lofi admin calendar inspect and send reviewed Browser AI input actions to Dentweb running inside Chrome Remote Desktop. It captures the Remote Desktop tab directly, so browser screen sharing is not required.

## Install

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select `chrome-extension/dentweb-browser-controller`.
5. Keep Chrome Remote Desktop open in a separate tab with Dentweb visible.
6. Open the Lofi admin calendar and use **Browser AI**.

To load a reservation list for a specific period, choose **From** and **To** in the Browser AI panel and click **Load reservation range**. Browser AI opens Dentweb reservation search, selects `특정기간`, replaces both dates, runs the search, and stops when the result list is visible.

Chrome displays a debugging notice while the extension is attached to the Remote Desktop tab. This is expected. The extension restricts input to `remotedesktop.google.com` tabs and accepts commands only from a Lofi admin page.
