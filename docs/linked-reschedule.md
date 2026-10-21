# Explicit linked reschedule (prepared, opt-in)

This code adds a narrow operation for an existing imported, linked reservation.
It does not enable general DentWeb-to-web imports, change the source, insert a
patient/reservation, or send a message. It is disabled unless both the server and
clinic integration agent have `DENTWEB_LINKED_RESCHEDULE_ENABLED=1`.

## Preconditions and API

The operator must independently verify authorization, patient identity, the latest
agreed date/time (KST), clinic availability, duplicate appointments and a fresh
read-only native snapshot. Neither an API request nor a successful unit test
substitutes for those checks or overrides a previous safety-review rejection.
This route checks overlapping active appointments for the **same patient**; it
does not determine chair/doctor availability or interpret conversation evidence.

Use the existing admin authentication with:

`POST /api/admin/reservations/{existingWebId}/linked-reschedule`

Fictional example (the memo digest must be calculated from the actual snapshot):

```json
{
  "operationId": "unique-stable-request-identifier",
  "expected": {
    "reservationId": 42,
    "patientId": 17,
    "name": "Fictional Patient",
    "phone": "010-1111-2222",
    "date": "2030-01-02",
    "time": "15:00",
    "state": 0,
    "durationMinutes": 30,
    "memoSha256": "<64 lowercase hex characters>"
  },
  "target": { "date": "2030-01-03", "time": "16:00" }
}
```

- Dates/times must be real `YYYY-MM-DD` and 24-hour `HH:mm` values in KST.
- `expected.name` (trimmed) and `expected.phone` (exact stored string) come from
  `TB_환자정보` for positive patient IDs, or `TB_신환예약자정보` for negative IDs.
  Reservation-row name/phone may be empty and are never rewritten.
- `memoSha256` is SHA-256 of the exact UTF-8 native memo, without line-ending
  normalization; SQL NULL is treated as an empty string. Never put the native
  memo, credentials, or a real patient example in this public document.
- `source` must already be `dentweb`; a positive existing linked reservation ID
  and `completed` integration status are required. No web record is created.
- MongoDB atomic compare-and-swap is required; file storage fails closed.
- HTTP 200 returns `{ok:true, record}`. **Pending is not completion.** 409 means
  disabled, unsupported, stale, conflicting or invalid request. Authentication
  is unchanged. Extra request fields are not applied to the reservation.

## Queue and completion contract

Only an updated agent advertising `X-Dentweb-Linked-Reschedule: 1` can claim this
action. The normal queue carries `action: "linked-reschedule"`, the existing web
and linked native IDs, and the validated request under `reschedule`. The agent
uses the same supported integration and a serializable transaction. It locks the
linked row, verifies identity/state/time/duration/memo, rejects an overlapping
active appointment for that patient, and updates only the appointment time and
the native modification timestamps. It reads back inside the transaction and
again after commit. It never inserts or deletes a row.

The existing `POST /api/admin/reservations/{id}/dentweb-sync` agent callback must
include `action`, `operationId`, `dentwebReservationId`, and `status`. Completion
also requires `verification` containing `reservationId`, `patientId`, `name`,
`phone`, `appointmentAt` (`YYYYMMDDHHmm`), `state`, `durationMinutes`, `memoSha256`.
All fields are checked against the stored request. A stale/unqualified callback
cannot complete or replace an explicit operation.

The original web date/time are stored in `dentwebRescheduleWebBefore`. The web
schedule stays unchanged while pending or failed. On verified completion, only
the **stored request target** is applied to web date/time; native schedule data
is not imported back. Source and linked IDs remain unchanged. Processing results
stay in `dentwebRescheduleVerified` and the existing sync metadata.

Replaying the same operation ID and identical canonical payload returns the
existing result without queuing again, including after failure. Reusing the ID
with different details is rejected. A stale claimed job can retry: if the native
row is already at target and all verification fields still match, the agent
performs no write. A post-commit verification failure requires read-only review,
not a new booking. Failed requests do not automatically retry.

**Initial scope limitation:** one explicit operation per linked web row. A later
different operation, generic edit/delete, or cancellation on that row is blocked
pending a separately reviewed follow-on operation/history design. Do not remove
the operation metadata, change `source`, or create another web row to bypass this.

## Deployment procedure (not executed by preparing this change)

1. Review this commit and tests. Preserve the previous deployed commit and agent
   version. Do not deploy during an unverified in-flight booking operation.
2. Deploy the reviewed server commit using the existing Render service/manual
   commit deployment procedure, with the feature flag unset. This alone cannot
   enqueue/claim linked-reschedule jobs.
3. Update the clinic agent to the same commit, including both new `lib` modules.
   Use its existing authorized launcher/configuration, preserve all credentials,
   and enable the flag in its private environment. Restart only the identified
   integration process once idle. The launcher exits early if an old process is
   already healthy, so merely starting it does not upgrade that running process.
4. Read local `/health` and confirm `linkedRescheduleSupported: true`,
   `sqlConfigured: true`, and no in-flight job. Do not call `/jobs/next` as a probe.
5. Enable the server flag. Re-read authorization, native patient/schedule/memo and
   clinic availability immediately before the explicit API request. Keep the
   before snapshot and response in the existing private audit location.
6. After the agent callback, independently re-read the actual native reservation
   and web result. Confirm patient, same linked ID, requested time, active state,
   original duration/memo, and no duplicate. Only then report completion.

Rollback: disable the server flag to prevent new requests/claims, allow any
in-flight transaction to finish, then verify its actual native outcome read-only.
Disable the agent flag and restore reviewed versions only once idle. Never roll
back a clinical appointment by overwriting or deleting it as part of code rollback.

## Validation

```text
node --check server.mjs
node --check tools/dentweb-sync-agent.mjs
node --test tests/linked-reschedule*.test.mjs tests/reservation-cancellation.test.mjs tests/dentweb-auto-queue.test.mjs tests/reservation-duration.test.mjs
node tools/test-linked-reschedule.mjs
```

The last command uses the existing SQL connection solely with session-local
temporary fixture tables; all `dbo.TB_` references are replaced and checked before
execution. It never starts the agent, claims a live job or writes clinic records.
It tests positive/negative patient identity, empty reservation-row identity,
idempotent retry, changed state/identity/time/memo/duration, overlaps and adjacent
appointments. Production deployment and a real appointment are not tested by it.
