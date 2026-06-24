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

## Notes

- Static multipage site.
- Primary entry point is `index.html`.
- Mobile and PDF tooling live in separate repositories.
