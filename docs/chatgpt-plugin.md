# Lofi public information plugin

The patient-facing plugin exposes four independent, unauthenticated, read-only
tools at `https://lofiesthetic.com/mcp`. It does not use an OpenAI API key or
call a language model. ChatGPT invokes its MCP tools directly.

## Data and boundaries

- `get_dental_prices`: reads the approved JSON-LD in `price-guide.html`, preserving
  all amounts, units, insurance conditions and the actual price review date.
- `get_price_questions`: reads the five published questions from that same page.
- `get_clinic_information`: reads public address, regular hours, phone and email
  from the English homepage and returns its public contact-information page.
- `get_treatment_guide`: reads one of five public homepage treatment articles.

Inputs are strict enums or empty objects. No free text, user location, symptoms,
patient identity or contact information is requested. Unknown fields and tools
are rejected. There are no database, admin, inbox, reservation, messaging or
payment dependencies. Tool inputs and raw errors are not logged or persisted.
Tools remain bounded to this clinic's published catalog; they do not browse
arbitrary URLs. All safety annotations are explicit.

The stateless MCP transport uses JSON responses, checks Host and browser Origin,
and limits POST bodies to 16 KiB. No sessions, cookies or tokens are created.
The route is isolated before the existing website/admin handlers.

## Local validation

```powershell
npm run check:plugin
npm run check:prices
node --test tests/admin-ai-authority.test.mjs
node --check server.mjs
```

The MCP tests initialize an actual SDK HTTP client and exercise tool discovery,
all four tools, five treatment overviews, invalid arguments, unknown operations,
Origin/Host enforcement, content types, malformed JSON and request size limits.
These are transport/contract tests, not evidence of ChatGPT review or approval.

## Package and publishing

The portable package lives in `plugins/lofi-esthetic-dentistry/`. ZIP only that
folder's contents, with `plugin.json` and `mcp.json` at the ZIP root. Never include
the website repository, `.env`, databases, private audits or patient material.

The package includes five positive and three negative review scenarios. Run
these in ChatGPT against the deployed endpoint before marking the review
materials complete. A local SDK test does not verify model tool selection.

Publishing also requires:

1. A verified developer/business identity and permission to submit in the chosen
   OpenAI Platform organization/project.
2. A draft in the official submission portal, with the package uploaded **With
   MCP** and the public endpoint connected without authentication.
3. Hosting the exact domain challenge token supplied by the portal at its
   specified URL. Do not invent a token or replace another plugin's challenge.
4. A reviewer-accessible video of the actual ChatGPT workflows and confirmation
   that the published privacy notice accurately describes the hosting setup.
5. Required policy attestations, review acceptance and explicit publication.

The package intentionally omits a fabricated demo URL, private reviewer
credentials and unverified identity claims. Endpoint deployment, creating a
personal plugin, public submission, approval and publication are separate
states. Report the state actually verified.

## References

## Icon asset

`plugins/lofi-esthetic-dentistry/assets/lofi-plugin-icon.png` is the square plugin
icon. It was adapted using the built-in image-generation tool from the existing
purple Lofi logo; the original website logo is preserved. Final generation prompt:

> Edit target: the referenced existing Lofi Esthetic Dentistry logo. Create a square
> 1024x1024 plugin app icon using ONLY the existing large purple lowercase stylized
> wordmark 'lofi' with its smiling o. Retain the recognizable letter shapes and violet
> color. Remove the small subtitle 'lofi esthetic dentistry' to keep the icon readable
> at small sizes. Center the large existing wordmark in a square very pale cream
> #fbfaff background, ample balanced padding, flat clean brand icon. No new graphic
> symbols, no tooth, no extra text, no border, no mockup, no 3D. Output one square PNG.
> This is an icon adaptation of an existing brand, not a redesign.

## Official documentation

- [Quickstart](https://developers.openai.com/plugins/quickstart)
- [MCP tools](https://developers.openai.com/plugins/build/mcp-server)
- [Portable package](https://developers.openai.com/plugins/build/plugins)
- [Submission](https://developers.openai.com/plugins/deploy/submission)
- [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines)
