# AI Business Copilot

The copilot helps interpret business records and prepare editable drafts. It is
decision support, not an autonomous operator: it never records payments,
changes stock, sends customer messages, publishes a shop, or creates an invoice
without a separate user action.

## Current review-first workflows

- The dashboard briefing summarizes recorded sales, expenses, invoices, stock,
  and consented storefront activity. Recommended next-step buttons open the
  relevant existing pages for the user to review.
- The shop builder sends the business name/type, up to 30 active product
  names/descriptions, the optional owner brief, and the uploaded storefront
  logo when available to Anthropic Claude Haiku 5.5. It suggests shop copy,
  SEO title/description, a template, and that template's default palette.
  The editable preview is shown only after the owner selects "Build with AI";
  applying fills the editable form, and the owner must separately save and
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

The AI Assistant uses `GEMINI_API_KEY` or `GROQ_API_KEY` according to
`AI_PROVIDER`; a configured but failing provider returns an error and does not
silently switch. The shop builder is separate: it requires the server-only
`ANTHROPIC_API_KEY` and does not fall back to Gemini or Groq. `AI_DISABLED`
disables both workflows.

Prompts can include summarized business metrics, the owner's message, product
names/descriptions/prices/tax rates, and customer IDs/names when needed to
prepare an invoice. Shop-builder requests also include the uploaded shop logo
when available. The application does not send payment credentials or
service-role keys to a model. Provider retention, training, processing region,
and contractual terms still require operator/legal review before production
use; see `THIRD_PARTY_SERVICES.md` and `DATA_FLOW.md`.
