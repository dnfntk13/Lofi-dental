# Instagram booking conversion audit

Insights uses a verified DM ledger, not inbox creation timestamps or appointment dates. The window is today and the preceding 13 calendar days in Asia/Seoul. Each new patient has one stable opaque `patientKey` and one first confirmation day. Reschedules retain that first day. Exclude follow-ups and cancelled bookings; keep unreadable or unconfirmed replies pending. Do not infer an advertising source from the treatment requested.

Authenticated admin endpoints:

- `GET /api/admin/traffic/instagram-audit` reads the previous ledger and evidence links.
- `PUT /api/admin/traffic/instagram-audit` replaces it with a validated audit.
- `GET /api/admin/traffic` returns only the aggregate summary under `instagramCampaigns`.

Payload: `auditedAt` (actual verification ISO timestamp), `coverage: {sinceDay, throughDay}`, `limitations` (short non-identifying coverage note), and `patients`.

Each patient has `patientKey` (16–100 letters/digits/underscore/hyphen, unique), `confirmedDay` (YYYY-MM-DD, first confirmation, never reschedule/import date), `status` (`confirmed`, `pending`, `cancelled`), `visitKind` (`new`, `followup`), `campaignId`, `videoTitle`, and `evidenceUrl` (Instagram DM thread URL). Use a stable hash of the patient/thread identity; when relatives book through one account, distinguish actual patients. Link across accounts only with verified identity evidence. Preserve older ledger rows to prevent returning patients from being classified as new.

At each audit, read changed conversations since the previous audit and scan the entire rolling window in Primary, General and Requests, including relevant earlier booking history and cancellation messages. Verify source links and actual video captions; use an empty title when inaccessible. Resolve multiple video sources to the one evidenced as producing the reservation; leave campaignId empty if attribution is ambiguous. Save only after the coverage review completes. If login or page failures prevent review, retain the earlier timestamp and ledger, and report the blocker; do not claim a fresh audit.

Never send patient messages as part of this audit. Do not publish names, phone numbers, raw DMs or evidence links in the public repository. The admin audit endpoint is separate from calendar storage and never queues Dentweb or creates reservations. After saving, verify aggregate totals from the live traffic endpoint, including pending and unknown-source counts.

The page recomputes the rolling window on load. If the audit does not cover the current window, it explicitly labels the counts as partial and shows the last checked time. This is conversation-evidenced conversion reporting, not Meta Ads Manager attribution or a revenue report.
