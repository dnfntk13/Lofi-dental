# Advertising measurement

## Current Google snippet — 2026-10-21

The user explicitly requested the supplied `lofiesthetic.com.txt` snippet unchanged. Its exact contents are preserved in `content/google-tag.html` and embedded directly inside the heads of 38 public HTML files, including all three reservation pages. `tools/install-google-tag.mjs` installs it idempotently, and article generation uses the same source. The server does not inject or suppress this snippet based on admin login. Admin pages, patient replies, signage, Concourse and extension UI are outside this public-site installation.

- Google Analytics tag: `G-S9ZX4LDDRR`.
- Google Ads tag: `AW-18223406681`.
- The supplied document submit listener sends the trimmed `#email` as `user_data` for `#concernForm`, then sends `AW-18223406681/vWfPCOr0maMdENm8zPFD`.
- The supplied click listener sends `AW-18223406681/VlJ6CPr1kKQdENm8zPFD` when the clicked anchor's href contains `whatsapp.com/channel`.
- This exact snippet measures submit events, not server-confirmed acceptance, and channel link clicks, not subscriptions. It has no additional consent gate or deduplication. Its standard config calls use Google's default behavior.
- The former server-injected tag, consent client, isolated frame, and post-success booking conversion hook were removed to avoid two competing conversion implementations. No Google Ads account goals or bidding settings were changed.

The previous custom implementation deliberately differed from the supplied snippet. This revision follows the user's explicit request to use it verbatim. Google's customer data policy remains documented at https://support.google.com/google-ads/answer/7475709.

Verification compares the stored snippet byte-for-byte with the supplied file and checks that each installed HTML head contains it exactly once. Script tests use an isolated JavaScript context and a fictional address, without loading Google or creating production bookings/conversions.

## Separate first-party attribution

`assets/visitor-attribution.js` keeps source, medium, campaign, content, referrer hostname and landing pathname in first-party session storage for up to 24 hours. This metadata is sent only to the clinic booking endpoint. Admin Insights counts requests when the server saves the booking. That first-party count remains separate from the supplied Google submit-event conversion.
