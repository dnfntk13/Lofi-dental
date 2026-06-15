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

## Notes

- Static multipage site.
- Primary entry point is `index.html`.
- Mobile and PDF tooling live in separate repositories.
