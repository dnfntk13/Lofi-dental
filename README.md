# Lofi Web

Standalone web repository for the main lofi site.

## Run

```bash
npm run dev
```

Default URL: `http://localhost:5173`

## Admin Inbox

- Admin entry URL: `http://localhost:5173/admin`
- The `/admin` page has a button that opens the inbox.
- Reservation submissions are stored in MongoDB Atlas when `MONGODB_URI` is configured.
- Without `MONGODB_URI`, local development falls back to `.data/reservation-inbox.json`.
- Protected with HTTP Basic Auth.
- Defaults: `lofidental` / `Lofidental1!`
- Override credentials with environment variables:

```bash
ADMIN_USER=your_user ADMIN_PASS=your_pass npm run dev
```

### MongoDB Atlas

Set these environment variables in Render:

```bash
MONGODB_URI=mongodb+srv://lofiesthetic:your_password@lofiesthetic.5rblpso.mongodb.net/?appName=lofiesthetic
MONGODB_DB_NAME=lofi-dental
MONGODB_COLLECTION=reservationMessages
```

Only `MONGODB_URI` is required. The database and collection names above are the defaults.

### Reservation Email Verification and Auto-Reply

Reservation submissions require a syntactically valid email address with an MX record and a 6-digit verification code sent to that address. This confirms the patient can receive mail at the exact address before the reservation is saved.

Recommended for Render: use Resend over HTTPS. This avoids outbound SMTP port timeouts.

```bash
RESEND_API_KEY=your_resend_api_key
RESEND_FROM=lofi dental <reservation@lofiesthetic.com>
RESERVATION_NOTIFY_TO=lofidentalcs@lofiesthetic.com
EMAIL_DNS_SERVERS=8.8.8.8,1.1.1.1
```

`RESEND_FROM` must use a sender domain verified in Resend. If `RESEND_API_KEY` is set, reservation email verification and auto-replies use Resend instead of Gmail SMTP.

Gmail SMTP can still be used as a fallback if Resend is not configured:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=lofidentalcs@lofiesthetic.com
SMTP_PASS=your_google_app_password
SMTP_FROM=lofidentalcs@lofiesthetic.com
RESERVATION_NOTIFY_TO=lofidentalcs@lofiesthetic.com
EMAIL_DNS_SERVERS=8.8.8.8,1.1.1.1
```

`SMTP_PASS` must be a Google App Password. If neither Resend nor SMTP variables are configured, email verification cannot send a code and reservations will not submit.

To check which email provider Render is using, open `/api/admin/email-status` with admin credentials. The response shows only whether each value is set; secret values are not returned.

### Dentweb Print Sync

Dentweb does not provide an official API here, so the local sync agent assumes the Windows Dentweb program is already running and logged in on the clinic computer. It brings the Dentweb calendar window to the front, clicks the `예약표출력` button, waits for a PDF to be saved, and uploads that PDF to the admin import API.

First install dependencies:

```bash
npm install
```

Run the local agent from the clinic computer before using the Calendar button:

```bash
npm run dentweb:agent
```

The agent listens on `http://127.0.0.1:5175`. Open the Admin Calendar on the same computer and click `Sync with Dentweb` to run the print/PDF/upload sync.

For a one-time terminal sync without the Calendar button:

```bash
npm run dentweb:sync
```

Before syncing, open the Dentweb desktop program manually, log in, and keep the calendar visible. The agent first tries to find a Windows button named `예약표출력`, `예약표 출력`, or `예약 출력` and click it. If Dentweb does not expose that button through Windows UI Automation, it falls back to window-relative coordinates `136,539`, which matches the bottom-left `예약표출력` button in the current clinic layout.

Useful options and environment variables:

```bash
LOFI_ADMIN_URL=https://lofiesthetic.com
ADMIN_USER=lofidental
ADMIN_PASS=Lofidental1!
DENTWEB_WINDOW_PATTERN=덴트웹|Dentweb|Dent Web
DENTWEB_PRINT_BUTTON_PATTERN=예약표출력|예약표 출력|예약 출력
DENTWEB_PRINT_CLICK=136,539
DENTWEB_PDF_DIR=C:\Users\USER\Downloads\lofi-dentweb-sync
DENTWEB_AGENT_PORT=5175
```

If a Windows save dialog opens, the agent tries to save the PDF into `DENTWEB_PDF_DIR` automatically. Imported Dentweb reservations are added to the reservation inbox and Patients. Existing same date/time slots are skipped.

### AI Assist

The public chat widget and admin tools can generate AI-assisted information, summaries, and drafts:

- Public website AI assistant: answers visitor questions from site content, explains reservation/contact flow, and saves the conversation to Patients for staff review.
- Patient message threads: summary, patient info extraction, and suggested reply drafts for Web, Instagram DM, and Email channels.
- Admin AI Assistant: conversationally reads recent schedules plus Web, Email, and Instagram DM threads, then suggests follow-ups and staff-reviewed reply drafts.
- Instagram DM import without webhook: paste DM conversation text into Admin AI Assistant, or use the local Chrome importer; saved DMs appear in Patients and can be checked one by one by AI.
- Calendar day detail: schedule summary, operational risks, prep notes, follow-ups, and short patient message draft snippets.
- Website insights: traffic summary, notable changes, acquisition notes, content opportunities, and recommended actions.

Set these environment variables in Render:

```bash
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
```

`OPENAI_MODEL` is optional and defaults to `gpt-4o-mini`. AI output is generated for visitor information and staff review; the assistant is instructed not to diagnose, prescribe, evaluate clinical photos, or promise treatment outcomes.

For local testing, the server also reads a local `.env` file in the repository root:

```bash
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
```

## Notes

- Static multipage site.
- Primary entry point is `index.html`.
- Mobile and PDF tooling live in separate repositories.
