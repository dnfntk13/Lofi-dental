# Article publishing and measurement

## Build

Run `npm run build:articles` after editing the bilingual content in `content/`.
Commit both the sources and generated HTML. Render serves the checked-in HTML;
there is no runtime dependency on an article rendering service.

- `articles.mjs`: five treatment articles and the editorial update date.
- `article-answers.mjs`: direct answers, comparisons and FAQs for those articles.
- `visit-articles.mjs`: English consultation and Andaz location guides.
- `tools/build-articles.mjs`: 14 article pages, two indexes, homepage cards,
  contextual treatment-page links and sitemap entries.

The generator replaces marked sections and must produce identical files on a
second run. It leaves unrelated homepage content and sitemap entries intact.
Canonical URLs and reciprocal English/Korean hreflang references use the public
domain. Article text, tables, questions and links are present in initial HTML.

## Editorial checks

Keep each article focused on a distinct patient question. Give the direct answer
before the photo, then explanation, a useful table, visible FAQs, sources and a
consultation link. Use verified local details and natural treatment terminology.
Do not add prices, guaranteed outcomes, invented visit durations or hotel
partnership claims. Keep personal or patient details out of these files.

The publisher is the clinic. The doctor profile link identifies the team; it does
not indicate medical review. Add a named reviewer and review date only after that
doctor has actually reviewed the text. Update the editorial date only when the
content changes. FAQ text does not claim eligibility for FAQ rich results.

## Validation before deployment

- Check all generated routes, links, assets and fragment targets.
- Verify one H1 and canonical, valid JSON-LD and unique IDs per article.
- Check the sitemap and language alternates.
- Inspect a comparison table and Korean article at mobile width; tables may
  scroll internally, but the page should not overflow horizontally.
- Run `node --test tests/booking-funnel.test.mjs tests/booking-attribution.test.mjs`.
- Rebuild twice and confirm that the second run produces no changes.
- After deployment, verify the public article pages and sitemap from the server.

## Measurement interpretation

The existing acquisition metadata stores a sanitized landing path for up to
24 hours. New booking-funnel events retain that path. Admin Insights shows
`Entry page` counts, and authenticated `GET /api/admin/traffic` returns them in
`bookingFunnel.byLandingPath`. Existing events without a recorded path remain
`unknown`; do not infer or backfill their source.

Counts are unique browser sessions at each funnel step, not unique patients.
`accepted` means a booking request reached the server; it is not confirmation by
the clinic. An article entry path measures attributed requests, not everyone who
read an article later in their visit, and does not establish causality.

Store analytics exports and baseline attempts outside the repository. Compare
equal completed date ranges after publication. Separate article entry requests,
organic search traffic and AI referrals where identifiable. Missing referrers
remain unattributed. Site analytics cannot measure all AI answer citations.

With an authorized Search Console or Bing Webmaster Tools session, verify the
existing property and sitemap, inspect sample article URLs, and record available
impressions/clicks or citation metrics with dates. Do not report an unverified
indexing request as successful indexing, or claim rankings from content changes.
Later trend reviews require accumulated data; this change creates no automation.

References:
- https://developers.google.com/search/docs/appearance/ai-features
- https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c
