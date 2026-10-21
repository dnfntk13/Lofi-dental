# Advertising landing pages and booking attribution

- General English dental care: `/english-dentist-seoul.html`
- Whitening: `/teeth-whitening-seoul.html`
- Veneers: `/lofi-lab-en.html`

The home page keeps its existing brand message and links to all three service paths.

`assets/visitor-attribution.js` keeps source, medium, campaign, content, referrer hostname and landing pathname in first-party session storage for up to 24 hours. It does not store keyword terms, click IDs, full referrer URLs, patient details or appointment dates. Storage failure does not prevent booking. This metadata is submitted only to the clinic's own booking endpoint.

The server marks a booking request only when it saves the submitted reservation. Admin Insights groups those saved website requests by acquisition source. Opening or refreshing the received page does not create a conversion. The totals describe requests, not confirmed appointments, and attribution may be missing if storage is unavailable or the visitor changes devices. Records created before this release are not retroactively counted.

The former unconditional Google loaders and patient-email/date events were removed. On 2026-10-20, at the user's request to follow Concourse's installation, the public HTML response now includes Lofi's Google tag (`G-S9ZX4LDDRR`, verified in Google Ads installation instructions). It loads once in the initial head on production HTTPS, including anonymous visits. The shared response helper covers public home, treatment, doctor and article pages; unknown routes, booking, patient replies, admin, signage and authenticated staff views are excluded.

Consent defaults to denied for analytics/ad storage, ad user data and personalization before initialization. Ads data redaction is on. The base installation does not grant consent or turn on automatic page-view reporting. Configuration removes query strings, fragments and referrers and disables Google signals, personalization and enhanced conversions. First-party Insights attribution remains separate.

## Optional booking-request conversion — 2026-10-20

Following Concourse's isolated measurement design, the site offers a separate optional English/Korean advertising-measurement choice. Declining does not prevent booking. The page footer reopens the choice to withdraw. Authenticated staff, admin, patient reply and signage pages are excluded from this client.

- Google Ads account: **lofi Korea (684-363-6892)**.
- Action: **Lofi website booking request completed**, category **Submit lead form**.
- Destination verified from the action's Google Ads event snippet: `AW-18223406681/vWfPCOr0maMdENm8zPFD`.
- Count: **One**, **Don't use a value** (entered 0, no revenue estimate), click window **90 days**, data-driven attribution. Enhanced conversions remain off. The action is **Secondary** for observation in **All conversions**, so it does not change bid optimization. Google adds the lead category to account goals when creating its first action; this action was explicitly changed to Secondary after creation. Existing actions, campaign budgets and bid strategies are unchanged.
- Trigger: only after `/api/reservations` returns a successful response to the public booking form. It measures **request acceptance**, not a confirmed appointment or completed treatment. The received page never fires a conversion on load or refresh.
- `assets/ads-measurement.js` stores explicit browser consent and, only after acceptance, validated `gclid`, `gbraid`, or `wbraid` for up to 90 days. It does not change first-party attribution or transmit these identifiers to the clinic booking API.
- Google conversion code runs in `ads-measurement.html`, in a hidden `sandbox="allow-scripts"` iframe **without** `allow-same-origin`, with `no-referrer`. The child cannot read the booking form, parent URL or parent storage. Only allowlisted ad click IDs enter its URL; the parent sends a generic completion message.
- The isolated child keeps ad/analytics storage and personalization denied; `ad_user_data` is granted only after explicit advertising-measurement consent. No contact details, treatment choices, concerns, appointment date/time, booking ID or local deduplication key are passed to Google. No enhanced conversions or remarketing events are enabled.
- A browser-local submission key and child event guard prevent duplicate sends. The booking receipt continues after at most two seconds even if the tag is blocked. Withdrawal removes the frame and stored click IDs; another tab's withdrawal is respected.
- Existing reservation `measurement.googleReportingConsent: false` remains unchanged: clinic records and patient data are not exported. This isolated, optional browser event is separate from those records.

Verification uses mocked Google scripts and local booking responses; no fabricated production reservation or Google conversion is sent. Google Ads can initially report the action as inactive/unverified until a real, consented visitor completes a request and reporting updates. SDK dispatch verification is not proof of Google attribution or a recorded real conversion.

Botox and existing treatment/price content remain on the site. These landing pages are public service information, not alternate content for ad reviewers.

## Shared head and WhatsApp channel conversion — 2026-10-21

The shared public-page head now configures both `G-S9ZX4LDDRR` and `AW-18223406681` using a single loader. Coverage includes public home, treatment, doctor, article, price-guide, Instagram and WhatsApp landing pages. Booking pages retain their head-injected consent client and isolated conversion frame; no Google script can read their form fields. Admin, patient replies, signage, unknown routes and authenticated staff views remain excluded.

The user supplied WhatsApp channel destination `AW-18223406681/VlJ6CPr1kKQdENm8zPFD`. After measurement consent, an actual HTTPS link click to `whatsapp.com/channel/<id>` or `www.whatsapp.com/channel/<id>` sends this separate conversion once per browser session. This measures a channel link click, not a channel subscription or a booking. No link URL or patient data is passed to the isolated frame. Same-tab navigation waits at most two seconds; new-tab and modified clicks retain their normal behavior. Booking and channel events have separate acknowledgments and deduplication.

The consent notice now mentions channel clicks, and its version is renewed so earlier consent is not silently expanded. The supplied email `user_data` block is intentionally not installed: Google customer data policy restricts enhanced-conversion measurement involving sensitive health/medical categories (https://support.google.com/google-ads/answer/7475709). The existing booking action fires only after successful server acceptance, not raw form submit attempts. No account goals, bid strategies or conversion-action settings are changed by this code update.
