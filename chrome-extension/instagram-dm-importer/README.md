# Lofi Instagram DM Importer

This Chrome Extension scans Instagram Direct in the browser and sends the extracted conversations to the lofi esthetic dentistry admin server. Admin AI can then read the saved Instagram DM threads and check them one by one.

## Install locally

1. Open Chrome and go to `chrome://extensions`.
2. Turn on `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder: `chrome-extension/instagram-dm-importer`.

## Use

1. Click the extension icon.
2. Confirm `Server URL` is `https://lofiesthetic.com` for production, or `http://localhost:5173` for local testing.
3. Set the import token to match `INSTAGRAM_EXTENSION_IMPORT_TOKEN` on the server.
4. `Let Admin AI read the open DM thread automatically` is enabled by default for near-live updates in the open thread.
5. `Let Admin AI read the DM list automatically` is enabled by default so the logged-in Instagram Direct tab automatically reads visible DM threads and saves them for Admin AI.
6. Click `Open Instagram DM`.
7. Log in to Instagram in that tab if needed.
8. Confirm the small `Lofi Importer` panel appears inside the Instagram Direct tab.
9. Keep the Instagram Direct tab open and visible. Auto-scan starts shortly after the importer loads and repeats while the tab is visible.
10. Click `Test server save` to verify the server URL and import token.
11. Open one DM thread and click `Save open DM now` in the popup or `Save open DM` in the Instagram tab panel to verify full-thread Instagram page reading.
12. Click `AI read visible screen` if the normal scanner misses a DM. This sends the visible Instagram Direct text/DOM snapshot to the server AI so it can extract and save the conversation more flexibly.
13. Click `3일치 스캔` or `일주일치 스캔` in the popup or Instagram tab panel to save recent DM conversations manually.

The server saves imported conversations into Patients through the existing Instagram DM storage path.

## Notes

- Production import uses `/api/instagram-extension/import`.
- Local testing uses `/api/local/instagram-extension/import`.
- The extension reads the Instagram page that is already open in Chrome; it does not ask for or store Instagram passwords.
- Manual sync and auto-scan first collect a stable snapshot of recent visible DM rows, then open them one by one, slowly scroll the right-side conversation candidates from top to bottom, and save readable conversations. Auto-scan uses the recent 3-day window.
- The server uses Admin AI to extract reservation date, patient name, phone number, and chief complaint from saved Instagram DM conversations, then stores those details in the reservation inbox/calendar data.
- Recent sync reads Instagram row date text such as minutes, hours, days, weeks, and month/day labels. Rows with unreadable date text are included so the scanner does not miss conversations when Instagram changes the UI.
- `AI read visible screen` is the fallback for Instagram UI changes: it does not put the OpenAI key in the extension. The extension sends page text to the lofi server, and the server-side AI extracts DM conversations.
- Auto-save is near-live only while an Instagram Direct thread is open in Chrome.
- Auto-scan runs only while the Instagram Direct tab is open and visible because it needs the page content rendered in the browser.
- Instagram changes its page markup often, so the scanner may need adjustment if the UI changes.