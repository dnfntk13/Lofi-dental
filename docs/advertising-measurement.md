# Advertising landing pages and booking attribution

- General English dental care: `/english-dentist-seoul.html`
- Whitening: `/teeth-whitening-seoul.html`
- Veneers: `/lofi-lab-en.html`

The home page keeps its existing brand message and links to all three service paths.

`assets/visitor-attribution.js` keeps source, medium, campaign, content, referrer hostname and landing pathname in first-party session storage for up to 24 hours. It does not store keyword terms, click IDs, full referrer URLs, patient details or appointment dates. Storage failure does not prevent booking. This metadata is submitted only to the clinic's own booking endpoint.

The server marks a booking request only when it saves the submitted reservation. Admin Insights groups those saved website requests by acquisition source. Opening or refreshing the received page does not create a conversion. The totals describe requests, not confirmed appointments, and attribution may be missing if storage is unavailable or the visitor changes devices. Records created before this release are not retroactively counted.

The former unconditional Google loaders and patient-email/date events were removed. On 2026-10-20, at the user's request to follow Concourse's installation, the public HTML response now includes Lofi's Google tag (`G-S9ZX4LDDRR`, verified in Google Ads installation instructions). It loads once in the initial head on production HTTPS, including anonymous visits. The shared response helper covers public home, treatment, doctor and article pages; unknown routes, booking, patient replies, admin, signage and authenticated staff views are excluded.

Consent defaults to denied for analytics/ad storage, ad user data and personalization before initialization. Ads data redaction is on. The installation does not grant consent, send booking conversions or turn on automatic page-view reporting. Configuration removes query strings, fragments and referrers and disables Google signals, personalization and enhanced conversions. First-party Insights attribution remains separate. Loading the base tag is not evidence of successful conversion measurement: a future measurement activation still needs explicit visitor consent and a verified generic conversion label, without patient identifiers or treatment details.

Botox and existing treatment/price content remain on the site. These landing pages are public service information, not alternate content for ad reviewers.
