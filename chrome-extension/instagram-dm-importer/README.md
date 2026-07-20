# Lofi Instagram DM Importer

This Chrome Extension scans Instagram Direct in the browser and sends the extracted conversations to the Lofi Dental admin server.

## Install locally

1. Open Chrome and go to `chrome://extensions`.
2. Turn on `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder: `chrome-extension/instagram-dm-importer`.

## Use

1. Click the extension icon.
2. Confirm `Server URL` is `https://lofiesthetic.com` for production, or `http://localhost:5173` for local testing.
3. Set the import token to match `INSTAGRAM_EXTENSION_IMPORT_TOKEN` on the server.
4. Enable `Auto-save current DM thread` for near-live updates.
5. Click `Open Instagram DM`.
6. Log in to Instagram in that tab if needed.
7. Open a conversation. New visible messages are auto-saved while the tab is open.
8. Click `Scan & save DMs` any time to scan the DM list manually.

The server saves imported conversations into Patients through the existing Instagram DM storage path.

## Notes

- Production import uses `/api/instagram-extension/import`.
- Local testing uses `/api/local/instagram-extension/import`.
- The extension reads the Instagram page that is already open in Chrome; it does not ask for or store Instagram passwords.
- Auto-save is near-live only while an Instagram Direct thread is open in Chrome.
- Instagram changes its page markup often, so the scanner may need adjustment if the UI changes.