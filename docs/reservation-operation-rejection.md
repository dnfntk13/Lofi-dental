# Unchanged failed-operation recovery

Protocol 4 adds an authenticated, narrowly scoped path for a failed write whose
expected phone differed from the native phone only by spaces, parentheses or
hyphens. Normal write identity guards remain exact.

1. Independently read the original linked reservation. Preserve the failed request.
2. POST `/api/admin/dentweb/reservations/:id/operations/:operationId/reject-unchanged`
   with `{expected}` containing the exact current native identity, original date,
   time, state, duration and UTF-8 SHA-256 memo/content digests. Only phone display
   separators may differ from the failed request. No target or calendar write is accepted.
3. This queues a **read-only** check, not a rejection by assertion. Protocols 1–3
   cannot claim it. The clinic agent reads under a serializable lock, then reads
   again after releasing the lock; both results must equal the unchanged source.
4. GET the same operation until `status: rejected` and `unchangedVerified: true`.
   Original request, error, failed claim snapshot and actual unchanged proof remain
   in the journal. No web calendar metadata is changed. `nativeVerified` and
   `webVerified` are not marked successful.
5. Only then may the authorized booking owner submit a **new operation ID** with
   a fresh exact native snapshot. The rejected operation moves to immutable history.

Changed identity, phone digits/country code, schedule, state, duration or memo/content
refuses recovery. A reservation already at the requested target must use ordinary
read-only `/recover`, not this route. Failed rejection checks retain the fence and
can only retry a read through `/recover`. Never change the recovery snapshot to
accept intervening edits. New commands recheck the current native snapshot, so an
edit after verification is not overwritten.

The recovery CAS checks current operation, revision, failed status and lease, then
invalidates the former lease. Callbacks check the new lease and processing status;
late original callbacks cannot mark a recovered operation completed or edit web
records. Repeated identical requests/results are idempotent. No forced completion,
direct native database write or automatic cancellation/reschedule is performed.
