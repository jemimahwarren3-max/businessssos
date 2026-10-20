# Data Flow — BusinessOS AI

Internal reference for how data actually moves through the system, verified
against the code rather than assumed. For the user-facing version of the
third-party portion, see `legal/PRIVACY_POLICY.md`.

## Overview

```
Browser (React SPA)
  │  HTTPS, credentials via httpOnly encrypted session cookie
  ▼
Server (Node / Nitro, TanStack Start server functions)
  │
  ├──▶ Supabase Postgres — all business data, RLS-enforced per request
  ├──▶ Supabase Auth — identity, session issuance
  ├──▶ Paynow — payment initiation/polling (subscription billing only)
  ├──▶ Groq — AI Assistant inference (aggregated business summary + question)
  ├──▶ Resend — merchant shop alerts and shopper receipts (queued if unset)
  └──▶ Upstash Redis — optional cache-aside for workspace lookups (no
       customer/transaction data; fails open if unconfigured)

Browser (independently of the server)
  └──▶ Google Fonts — typeface + stylesheet, direct browser→Google request
```

## Flow 1: A signed-in request

1. Browser sends a request with the sealed session cookie attached
   automatically (no client-side token handling).
2. TanStack Start middleware validates the session, refreshing it via
   Supabase Auth if expired (fails closed on refresh failure — session is
   cleared, not treated as valid).
3. The resulting per-request Supabase client is scoped to that user's RLS
   context — every subsequent query is automatically filtered to what that
   user's business membership allows, at the database level.
4. Response headers (CSP, HSTS, etc. — see `SECURITY.md`) are attached to
   every response, not just this one.

**Data at rest**: Postgres (Supabase), encryption-at-rest guarantees not
independently verified — see `legal/LEGAL_REVIEW_REQUIRED.md`.
**Data in transit**: HTTPS throughout; session cookie is httpOnly + secure

- sameSite=Lax.

## Flow 2: Subscription checkout (Paynow)

1. Server sends: a reference ID, the user's email, a payment description,
   and the amount to Paynow. For mobile-money channels (EcoCash/OneMoney),
   also the phone number the user entered for that payment.
2. Paynow returns either a redirect URL (web/card) or on-screen instructions
   (mobile money) — BusinessOS AI never receives or stores a card number or
   CVV; that's handled entirely on Paynow's side.
3. Paynow calls back a webhook. The webhook's SHA512 signature is verified
   against `PAYNOW_INTEGRATION_KEY` before any database lookup happens; even
   after that, the payment status is never trusted from the webhook body —
   the server re-polls Paynow's own servers via a stored `poll_url` before
   crediting anything.
4. On confirmed payment, the subscription row is updated and the workspace
   cache (if Redis is configured) is invalidated for every member of that
   business.

**Data retained**: `subscription_payments` table (reference, amount,
status, timestamps) — indefinitely, as a billing history record for the
business (surfaced on the Billing settings page).

## Flow 3: AI Assistant

1. Server builds a summary of the business's last-30-days numbers
   (`src/lib/ai.server.ts`'s `buildBusinessSummary`) — total sales/profit/
   expenses, top 5 products by revenue, top 5 customers by name and
   purchase total, expense category totals, inventory value, low-stock
   product names. Never raw database access, and never full transaction
   history or customer contact details.
2. That summary, a fixed system prompt, and up to the last 12 messages of
   the conversation are sent to Groq's chat completions API.
3. Groq's response is returned to the user. Nothing from this exchange is
   persisted server-side beyond the conversation shown in the browser tab
   (no chat history table).

**Third-party data retention**: Groq's retention/training policy for this
traffic has not been independently confirmed — see
`legal/LEGAL_REVIEW_REQUIRED.md`.

## Flow 4: Account deletion

1. `delete_owned_businesses()` (Postgres, `SECURITY DEFINER`) checks every
   business the caller owns for other active members; if any exist,
   deletion is refused entirely (atomically — verified live that a refused
   deletion leaves zero partial state).
2. If clear, every business the caller solely owns is deleted, cascading
   automatically to all of that business's data (products, sales, invoices,
   customers, everything) via existing foreign-key `ON DELETE CASCADE`
   relationships.
3. The Supabase Admin API (service-role) deletes the `auth.users` row,
   which cascades to the user's `profiles` row and any remaining
   non-owner `business_members` rows.
4. The server session cookie is cleared.

This is genuinely immediate, permanent deletion, not a soft-delete flag —
verified live this session (business, products, and login all confirmed
gone from the database immediately after the call).

## Flow 5: Data export

`src/lib/data-export.server.ts` reads every business-owned table
(`products`, `categories`, `suppliers`, `customers`, `sales`, `sale_items`,
`invoices`, `invoice_items`, `quotes`, `quote_items`, `payments`,
`expenses`, `inventory_movements`) filtered to the requesting business, and
returns it as one JSON object, downloaded client-side as a file. Nothing is
written to disk or a temp table server-side — it's assembled in memory per
request and streamed back.

## What's explicitly _not_ collected or sent anywhere

- No analytics or tracking tool is integrated (verified by grep — no
  Google Analytics, Meta Pixel, PostHog, Segment, or similar in the
  codebase as of this writing).
- No customer contact details (email/phone/address) are ever sent to
  Groq or Paynow — only names (Groq, in the top-customers summary) or the
  paying user's own email/phone (Paynow, for the payment itself).
- No raw payment card data touches BusinessOS AI's servers at any point.
