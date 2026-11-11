# Verified distinct patients sharing a family phone

The authenticated `POST /api/admin/reservations` route optionally accepts
`sharedPhoneIdentity` for a verified patient distinct from the registered people
sharing their real contact number. Public forms and generic updates do not accept
this selection. Ordinary name/phone mismatch handling remains unchanged.

```json
{
  "mode": "distinct-patient",
  "name": "Different Family Member",
  "phone": "01055551234",
  "expectedPatientIds": [10, 20],
  "verifiedAt": "2026-11-01T00:00:00Z",
  "evidence": "Original conversation link and explicit separate-person evidence; exact-name, alias, duplicate and availability checks completed."
}
```

Use the patient's actual full name and phone in both the reservation and evidence.
Keep patient-specific evidence in the authenticated record and private audit files,
never in this repository. Preserve the agreed time, duration and Korean memo.
Do not use this option to resolve a possibly misspelled existing patient's name.

Before submitting, verify `sharedPhoneIdentityVersion: 1` on both
`GET /api/admin/dentweb/capabilities` and the clinic agent's `/health`.
Older agents cannot claim these jobs. The current agent validates the evidence
again and passes its exact family patient IDs into the existing reservation
transaction. Under serializable locks it requires the same complete phone-match
set and no matching registered name or registered-patient appointment alias,
including archived appointments. Any conflict fails with 51011. It never selects
a registered family member. The existing unregistered-patient reservation path,
duplicate/status checks, linked-ID checks and cancellation guards remain in use.

This creates an unregistered reservation identity, not a completed patient chart
or a claim that prior attendance has been disproven. Recheck native patient ID,
actual phone, time, duration, state and memo independently before confirming to
the patient. Failed or uncertain submissions must be inspected before retrying.
Future changes to a linked booking use the existing explicit operations route.
