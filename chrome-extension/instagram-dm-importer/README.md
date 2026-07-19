# Lofi Instagram DM Importer

This Chrome Extension scans Instagram Direct in the browser and sends the extracted conversations to the local Lofi Dental admin server.

## Install locally

1. Start the Lofi Dental server on `http://localhost:5173`.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on `Developer mode`.
4. Click `Load unpacked`.
5. Select this folder: `chrome-extension/instagram-dm-importer`.

## Use

1. Click the extension icon.
2. Click `Open Instagram DM`.
3. Log in to Instagram in that tab if needed.
4. Click `Scan & save DMs`.

The server saves imported conversations into Messages and Patients through the existing Instagram DM storage path.

## Notes

- This works only with the local admin server on `localhost:5173`.
- The extension reads the Instagram page that is already open in Chrome; it does not ask for or store Instagram passwords.
- Instagram changes its page markup often, so the scanner may need adjustment if the UI changes.