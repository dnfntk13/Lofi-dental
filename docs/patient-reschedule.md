# Patient appointment changes

`/reservation/manage.html` (English) and `?lang=ko` (Korean) let a patient verify their booking email, select an existing upcoming appointment, and choose another available time. Booking and received pages and future confirmation emails link here.

## Identity and availability

- Separate email OTP and 30-minute session; does not trust the new-booking `verifiedEmails` map. OTP expires after 10 minutes, is single use, and allows five attempts. Send and verify limits are persisted. Only a hashed session token is stored; the browser keeps its token in memory, never a URL or local storage.
- Only records owned by that verified email are returned. Imported Dentweb records, past/cancelled appointments and the two user-confirmed test records are excluded. Unlinked or unverified reservations require clinic review. No new reservation or patient is created.
- An authenticated clinic agent advertises `X-Dentweb-Patient-Reschedule: 1`. Its heartbeat expires after 45 seconds. Without it, requests fail closed.
- `patient-reschedule-read` jobs read the linked native identity, original schedule, state, duration and content digests, plus anonymous occupied intervals. They never import native appointments. Read results use the agent's durable outbox and a leased admin callback.
- Available times respect Korean time, the booking calendar's operating hours/holidays, a 90-day horizon, lunch, protected surgery windows, actual native duration, other native noncancelled appointments and existing web bookings. Availability snapshots expire after two minutes. Keep the published holiday schedule in `patient-reschedule-times.mjs` aligned with the booking calendar when hours change.

## Write and confirmation

- Patient changes queue the existing reservation-operation journal with `patientSelfService: true`. A client request ID makes retries idempotent. Older agents cannot claim these writes.
- The clinic agent requires the exact server-approved target, rechecks native identity/state/time/duration/memo/content, and checks all other noncancelled native appointments inside the same serializable transaction. Collision or uncertain occupancy prevents the write.
- Original web and native IDs are retained. Existing notes and clinical content stay unchanged. Native transaction and post-commit readback must match before the requested web schedule is updated. Only both verified saves produce a completed response.
- Failed/uncertain operations stay reviewable in the existing journal and are not blindly requeued. A stale lease after the target time can only verify an already-saved result. No reverse import, native-to-web background synchronization, or patient messaging is introduced by this feature.

## Checks

`node --test tests/patient-reschedule.test.mjs tests/patient-reschedule-agent.test.mjs tests/reservation-operations.test.mjs tests/linked-reschedule.test.mjs`

Clinic SQL fixture checks: `node tools/test-patient-reschedule-read.mjs` and `node tools/test-patient-reschedule-operations.mjs`. These use session-local temporary tables, not real appointments. They use PowerShell 7 without an execution-policy override; `LOFI_TEST_PWSH` can specify the approved runtime path.

Deployment order: server and public UI first, then update the existing clinic agent only when idle with an empty result outbox. Preserve all existing local agent modifications. Confirm agent health `patientRescheduleVersion: 1` and public `GET /api/reservation-management/config` availability. Never call `jobs/next` as a status probe.
