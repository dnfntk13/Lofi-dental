# Explicit DentWeb reservation operations

Authenticated `POST /api/admin/dentweb/reservations/:nativeId/operations` accepts a stable `operationId`, `action` (`reschedule` or `cancel`) and a freshly verified `expected` snapshot. Rescheduling also requires `target: {date,time}`. Expected fields: reservationId, patientId, name, phone, date, time, state (0), durationMinutes, memoSha256 and contentSha256 (UTF-8 SHA-256).

Check identity, the latest patient agreement, opening hours, availability, duplicates and shared work status before submitting. A supported operation is not permission to change an appointment. Cancellation preserves its number and content. Rescheduling updates the same native number; it never creates another booking or reuses an unrelated web link.

Operations live in a separate `dentwebReservationOperations` command journal. An unlinked native reservation does not become a web calendar record. Existing web records are preserved; only fields requested by the explicit command are changed after native verification. No native-to-web calendar import runs.

`GET .../operations/:operationId` returns pending/processing/verifying/completed/failed. Completion requires both `nativeVerified` and `webVerified`. Completed operations remain in history when the next operation is submitted. The same operation ID is idempotent; changed payloads and overlapping operations reject. A new operation after completion must use a fresh native snapshot and a new operation ID.

Only the clinic integration agent advertising `X-Dentweb-Reservation-Operations: 1` claims this work. It performs locked identity/content/schedule checks, preserves fields outside the requested change and reads the native result after commit. SQL fixture tests replace every production table with connection-local temporary tables.

The agent stores results in `.data/dentweb-results/pending-result.json` before reporting them. It retries the result callback before claiming more work. Do not delete this outbox or submit a duplicate operation when acknowledgement is unavailable. `POST .../operations/:operationId/recover` completes a stored verified result or queues **read-only** verification after failure; it does not blindly repeat the write. Identity/concurrency conflicts require review of actual records.

Legacy routes remain for untouched legacy reservations. Once an operation journal command updates a linked row, further mutations use the operation endpoint. Late legacy callbacks cannot replace its result. The local legacy cancellation identity/archive-default fixes are retained.

For a failed legacy linked-reschedule callback whose native change already succeeded, use `POST .../operations/recover-legacy` with `{operationId,webId,legacyOperationId,verified}`. `verified` contains a fresh native snapshot in the expected-field format, at the original requested target. The server derives the target from the stored legacy request, requires the same patient/identity/duration/state, preserves both the original request and fresh content digests, and queues the clinic agent in mandatory read-only mode. Changed targets, ambiguous links and in-flight jobs reject. Staff memo edits remain intact. Only the original requested web date/time and completion metadata are reconciled after native verification; no calendar row is created and no native change is retried.

Validation: `node --test tests/reservation-*.test.mjs tests/dentweb-*.test.mjs tests/linked-reschedule*.test.mjs` and `node tools/test-reservation-operations.mjs` (clinic connection, temporary tables only).
