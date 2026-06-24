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

Set these environment variables in Render:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=lofidentalcs@lofiesthetic.com
SMTP_PASS=your_google_app_password
SMTP_FROM=lofidentalcs@lofiesthetic.com
RESERVATION_NOTIFY_TO=lofidentalcs@lofiesthetic.com
EMAIL_DNS_SERVERS=8.8.8.8,1.1.1.1
```

`SMTP_PASS` must be a Google App Password. If SMTP variables are not configured or Gmail rejects the credentials, email verification cannot send a code and reservations will not submit.

## Notes

- Static multipage site.
- Primary entry point is `index.html`.
- Mobile and PDF tooling live in separate repositories.
