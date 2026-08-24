# Third-Party Services — BusinessOS AI

Every external service the application actually integrates with, verified
against `package.json` dependencies and the code that calls them — not a
speculative list. See `docs/DATA_FLOW.md` for how data moves to each of
these, and `legal/PRIVACY_POLICY.md` for the customer-facing version.

| Provider | Purpose | Data shared | Region | Privacy/security docs | Retention | DPA/contract status |
|---|---|---|---|---|---|---|
| **Supabase** (supabase.com) | Database (Postgres), authentication, session infrastructure. The entire backend runs on it. | All account and business data. | `LEGAL REVIEW REQUIRED`: confirm this project's actual data-center region. | [supabase.com/privacy](https://supabase.com/privacy), [supabase.com/security](https://supabase.com/security) — not independently re-verified. | Until account/business deletion (see `docs/DATA_FLOW.md` Flow 4). | `LEGAL REVIEW REQUIRED`: confirm whether a Data Processing Agreement exists/is needed. |
| **Paynow** (paynow.co.zw) | Subscription payment processing. | User's email; phone number for mobile-money channels; payment amount/description. Never card numbers or CVV. | Zimbabwe. | `LEGAL REVIEW REQUIRED`: obtain and review Paynow's merchant agreement and privacy terms. | `LEGAL REVIEW REQUIRED`. | `LEGAL REVIEW REQUIRED`: merchant agreement status. |
| **Groq** (groq.com) | AI Assistant inference. | Aggregated 30-day business summary (sales/profit/expense totals, top product/customer names, low-stock names) plus the user's typed questions. Never raw customer contact details or payment data. | `LEGAL REVIEW REQUIRED`: not confirmed. | `LEGAL REVIEW REQUIRED`: Groq's API data-retention/training policy has not been independently verified. | `LEGAL REVIEW REQUIRED`. | `LEGAL REVIEW REQUIRED`. |
| **Upstash** (upstash.com) | Optional edge cache for the per-user workspace lookup (business/role/plan). Entirely optional — the app functions identically without it, falling through to Postgres. | A cached copy of business/role/plan, short TTL. No customer or transaction data. | `LEGAL REVIEW REQUIRED` if/when enabled. | Not evaluated — treat as `LEGAL REVIEW REQUIRED` before enabling in production if not already. | Short TTL (cache expiry), not long-term storage. | `LEGAL REVIEW REQUIRED` if enabled. |
| **Google Fonts** (fonts.googleapis.com / fonts.gstatic.com) | Loads the app's typeface. | The requesting browser's IP address, per Google's standard request handling — not something BusinessOS AI controls or receives. | Google's infrastructure. | [Google's font-serving privacy notes](https://developers.google.com/fonts/faq/privacy) — not independently re-verified. | Governed by Google, not BusinessOS AI. | N/A — no contract, just a public static asset load. |

## Services deliberately not integrated

Documented so it's clear these were considered, not overlooked:

- **No analytics/tracking tool** (Google Analytics, Meta Pixel, PostHog,
  Segment, etc.) — confirmed absent by grepping the codebase.
- **No email-sending service beyond Supabase Auth's built-in transactional
  email** (sign-up confirmation, password reset) — no separate provider
  like SendGrid/Postmark/Resend is integrated.
- **No file/object storage service** — the app doesn't currently support
  file uploads (product images, receipts, etc. are represented as URL
  fields in the schema but there's no upload flow wired to any storage
  provider).
- **No error-monitoring/APM service** (Sentry, Datadog, etc.) — errors are
  currently only logged to server stdout/stderr.

## Process for adding a new one

Not formally defined yet. `LEGAL REVIEW REQUIRED` / recommended practice:
before adding any new third-party integration, update this file with the
same columns as above, and check whether it changes anything in
`legal/PRIVACY_POLICY.md` (a new data recipient almost always does).
