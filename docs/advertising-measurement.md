# Advertising landing pages and booking attribution

- General English dental care: `/english-dentist-seoul.html`
- Whitening: `/teeth-whitening-seoul.html`
- Veneers: `/lofi-lab-en.html`

The home page keeps its existing brand message and links to all three service paths.

`assets/visitor-attribution.js` keeps source, medium, campaign, content, referrer hostname and landing pathname in first-party session storage for up to 24 hours. It does not store keyword terms, click IDs, full referrer URLs, patient details or appointment dates. Storage failure does not prevent booking. This metadata is submitted only to the clinic's own booking endpoint.

The server marks a booking request only when it saves the submitted reservation. Admin Insights groups those saved website requests by acquisition source. Opening or refreshing the received page does not create a conversion. The totals describe requests, not confirmed appointments, and attribution may be missing if storage is unavailable or the visitor changes devices. Records created before this release are not retroactively counted.

Unconditional public-page Google Analytics/Ads loaders and patient-email/date events were removed. Lofi has no existing advertising-consent control. Google reporting therefore stays off; this is not Google Ads conversion tracking and Ads may continue to show zero conversions. Do not restore automatic tags or enhanced conversions. Any later integration needs an explicit advertising-measurement consent flow and a verified generic booking conversion label, without patient identifiers or treatment details.

Botox and existing treatment/price content remain on the site. These landing pages are public service information, not alternate content for ad reviewers.
