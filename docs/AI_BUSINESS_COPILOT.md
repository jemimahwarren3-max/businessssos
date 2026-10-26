# AI Business Copilot

The copilot helps interpret business records and prepare editable drafts. It is
decision support, not an autonomous operator: it never records payments,
changes stock, sends customer messages, publishes a shop, or creates an invoice
without a separate user action.

## Current review-first workflows

- The dashboard briefing summarizes recorded sales, expenses, invoices, stock,
  and consented storefront activity. Recommended next-step buttons open the
  relevant existing pages for the user to review.
- The shop builder uses the owner's brief and active catalogue to suggest shop
  copy, SEO title/description, a template, and a palette. "Apply ideas to
  editor" only fills the editable form. The owner must separately save and
  publish.
- Invoice assistance uses the owner's request, existing customer names, and
  active product catalogue. The server accepts only IDs from that business and
  fills product prices and tax rates from the database. "Use suggestion in
  editable draft" only prefills the form; the owner reviews it and presses
  "Save draft". Sending an invoice is a separate action.
- Sales and inventory insights remain visible in their existing reports. The
  AI chat can explain the business snapshot and suggest next steps, but cannot
  apply them.

Every server workflow checks the user's business permissions and subscription
write entitlement. AI output is schema-validated; IDs and prices are resolved
against the caller's own business. AI keys are server-only and are never sent to
the browser.

## Provider configuration and data sharing

`GEMINI_API_KEY` is preferred when configured. `GROQ_API_KEY` is used as the
fallback when Gemini is not configured. A configured but failing Gemini key
returns an error; it does not silently switch providers.

Prompts can include summarized business metrics, the owner's message, product
names/descriptions/prices/tax rates, and customer IDs/names when needed to
prepare an invoice. The application does not send payment credentials or
service-role keys to the model. Provider retention, training, processing
region, and contractual terms still require operator/legal review before
production use; see `THIRD_PARTY_SERVICES.md` and `DATA_FLOW.md`.
