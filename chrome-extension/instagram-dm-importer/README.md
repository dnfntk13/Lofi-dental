# Lofi Instagram DM Importer

This Chrome Extension scans Instagram Direct in the browser and sends the extracted conversations to the Lofi Dental admin server. Admin AI can then read the saved Instagram DM threads and check them one by one.

## Install locally

1. Open Chrome and go to `chrome://extensions`.
2. Turn on `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder: `chrome-extension/instagram-dm-importer`.

## Use

1. Click the extension icon.
2. Confirm `Server URL` is `https://lofiesthetic.com` for production, or `http://localhost:5173` for local testing.
3. Set the import token to match `INSTAGRAM_EXTENSION_IMPORT_TOKEN` on the server.
4. Enable `Auto-save current DM thread` for near-live updates in the open thread.
5. Enable `Auto-scan DM list after login` if you want the logged-in Instagram Direct tab to automatically read visible DM threads and save them every few minutes.
6. Click `Open Instagram DM`.
7. Log in to Instagram in that tab if needed.
8. Confirm the small `Lofi Importer` panel appears inside the Instagram Direct tab.
9. Keep the Instagram Direct tab open. Auto-scan repeats while the tab is visible, but it does not start immediately so you can open threads manually.
10. Click `Test server save` to verify the server URL and import token.
11. Open one DM thread and click `Save open DM now` in the popup or `Save open DM` in the Instagram tab panel to verify Instagram page reading.
12. Click `Read each DM & save` in the popup or `Read DMs` in the Instagram tab panel any time to scan the latest 10 DM conversations manually.

The server saves imported conversations into Patients through the existing Instagram DM storage path.

## Notes

- Production import uses `/api/instagram-extension/import`.
- Local testing uses `/api/local/instagram-extension/import`.
- The extension reads the Instagram page that is already open in Chrome; it does not ask for or store Instagram passwords.
- Manual scan and auto-scan use the left DM list pane, click the latest 10 visible DM rows one by one, move the right-side conversation scroll candidates to the first visible messages, read downward, and save readable conversations.
- Auto-save is near-live only while an Instagram Direct thread is open in Chrome.
- Auto-scan runs only while the Instagram Direct tab is open and visible because it needs the page content rendered in the browser.
- Instagram changes its page markup often, so the scanner may need adjustment if the UI changes.