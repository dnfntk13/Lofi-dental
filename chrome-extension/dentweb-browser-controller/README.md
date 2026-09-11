# Lofi Dentweb Appointment Controller

This Chrome extension adds a selected web reservation to Dentweb through a Chrome Remote Desktop tab. It is a one-way workflow from the Lofi admin calendar to Dentweb; it does not synchronize the Dentweb schedule back to the website.

## Install

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select `chrome-extension/dentweb-browser-controller`.
5. Keep Chrome Remote Desktop open in a separate tab with Dentweb visible.
6. Open the Lofi admin calendar and select a reservation.
7. Click **Add to Dentweb**.
8. Keep the Remote Desktop tab visible until the calendar reports **Added to Dentweb**.

Before saving, the controller checks the visible Dentweb schedule for the same date, time, and patient name. Reservations marked **Added to Dentweb** cannot be submitted again from the calendar.

Chrome displays a debugging notice while the extension is attached to the Remote Desktop tab. This is expected. The extension restricts input to `remotedesktop.google.com` tabs and accepts commands only from a Lofi admin page.
