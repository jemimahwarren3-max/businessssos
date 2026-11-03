# Implementation roadmap

**Date:** 2 November 2026  
**Status:** Stage 5 (Messaging as a channel) implemented on this branch. Later stages still wait for approval.

Do not implement all 100 items. Each stage below is a shippable slice with migrations, RLS, UI, empty/error states, tests, and a regression pass on POS + checkout.

## Stage 0 — this audit (done)

Documents:

- `docs/KWETUU_100_FEATURE_AUDIT.md`
- `docs/KWETUU_ZIMBABWE_MARKET_REQUIREMENTS.md`
- `docs/KWETUU_FEATURE_PRIORITY_MATRIX.md`
- `docs/KWETUU_DATABASE_GAP_ANALYSIS.md`
- `docs/KWETUU_INTEGRATION_GAP_ANALYSIS.md`
- this file

No application behaviour change.

## Stage 1 — Morning desk (done in this PR)

**Goal:** An owner can open Kwetuu after a shift and see money in, who owes them, what is running out, and share a product on WhatsApp — without a new backend vendor.

**In:**

1. Daily takings by payment method on dashboard and cash-up (same currency as the business).
2. POS labels for EcoCash, InnBucks, ZIPIT, bank (no provider verify).
3. Customer credit book + repayment RPC.
4. WhatsApp product share and receipt **prefill** (`buildWhatsAppLink`).
5. Low-stock block on the home dashboard (reuse `loadDashboard`).
6. Offline queue: surface closed-drawer failures; do not rewrite IndexedDB.

**Out:** split tenders, FX ledger, lay-by, Cloud WhatsApp, variants, posters, i18n, stock transfers.

**Acceptance:**

- Cashier sees today’s cash vs mobile money vs bank vs credit without exporting CSV.
- Recording a repayment reduces `outstanding_balance` and writes `payments` + audit.
- Sharing a product opens WhatsApp with name, price, availability, and URL; nothing is auto-sent.
- Two-tenant integration test still passes.
- Existing `create_sale`, manual shop proof, and Paynow gating unchanged.

**Estimate of invasiveness:** mostly `business.server.ts`, `sales.tsx`, `dashboard.tsx`, `cash-drawer.tsx`, `customers.tsx`, `store-experience.tsx`, one small RPC migration + staging-manifest entry.

## Stage 2 — How people actually pay (done in this PR)

**Goal:** A cashier can take cash + EcoCash (or other rails) on one sale, and cash-up still expects only the cash that went in the till.

**In:**

- Split tenders on POS (`payments` rows sum to sale total; unique rails; max 8).
- Cash-up expected cash = cash tenders only (`cash_post_movement` for the cash part).
- Optional `payments.currency` + `amount_original` stored as typed. No `platform_fx` conversion.
- Refunds of mixed sales put cash back first, then digital, then reduce credit.
- Shop checkout stays single-method.

**Out:** FX ledger / `fx_rates`, silent conversion, shop-order split pay, EcoCash APIs.

## Stage 3 — Notebook and delivery (done in this PR)

**Goal:** The morning notebook (who we owe, deposits, lay-by) and Zimbabwe delivery/market labels, without new vendors.

**In:**

- Supplier outstanding hooked to POs; `record_supplier_payment`.
- Customer deposits (held / applied / refunded).
- Lay-by with instalments; stock deducted only at collect; collect does not post cash again.
- Harare / Bulawayo / Mutare zone presets (client data, fee 0).
- Public verified-store badge on `/market` (verified-purchase review, not KYC).
- Optional `products.wholesale_price` column. POS still uses `selling_price`.

**Out:** FX ledger, EcoCash APIs, variants, posters, i18n, stock transfers, shop-order split pay.

## Stage 4 — Offline income protection (done in this PR)

**Goal:** A power cut or a failed sync does not take the day’s income, and a metered phone does not burn data on product photos.

**In:**

- Snapshot in-progress POS cart in IndexedDB `posDrafts` (version bump only; do not rewrite `pendingSales`).
- Offline stock honesty in the UI (“estimate”).
- Sync dead-letter: **These sales need you** + Retry this sale.
- Low-data mode (defer product photos; logos/auth/MFA still load).

**Out:** SQL migrations, WhatsApp Cloud, rewriting IndexedDB, FX, EcoCash APIs.

**Acceptance:**

- Refreshing POS with items in the cart restores them with a power-cut banner.
- Offline search says the stock figure is an estimate.
- A failed queued sale can be retried one-by-one after the cashier fixes the cause (e.g. opens the drawer).
- Account → Low-data mode defers product photos until tap.

## Stage 5 — Messaging as a channel (done in this PR)

**Goal:** Order updates and opted-in shop news can sit on a WhatsApp outbox without lying that Meta sent them.

**In:**

- `notification_outbox.channel = 'whatsapp'` + `to_phone`.
- Checkout opt-in for transactional WhatsApp order updates.
- Signed-in marketing list (`shopper_shop_consents.marketing`) and Grow → queue to opted-in numbers.
- Order status / placed / payment template keys (`kwetuu_order_*` documented; not claimed as Meta-approved).
- `complete_notification_outbox` refuses WhatsApp `sent` without a provider message id.

**Out:** Meta Groups, Cloud send unless credentials exist, fake sent, POS `wa.me` rewrite.

**Acceptance:**

- Opted-in order updates enqueue as `pending` WhatsApp rows.
- Without Cloud credentials, flush does not claim or mark them sent.
- A worker cannot mark WhatsApp sent with an empty provider id.
- Marketing queue only includes shoppers who opted in.

## Later (do not schedule until Stages 1–5 are used in anger)

Coupons, loyalty, abandoned cart, posters, voice, diaspora, B2B marketplace, peer benchmarks, academy, Shona/Ndebele, branch transfers, product variants/bundles, EcoCash/InnBucks APIs.

## Definition of done for every future stage

Copied from the brief; this is the bar:

- Database migration + staging-manifest `skipIf` (skip when the slice is client-only, as Stage 4)
- RLS / security-definer RPCs
- Full UI workflow, including mobile width
- Validation, loading, empty, failure
- Integration test where money or tenants are involved
- Documentation (`KNOWN_LIMITATIONS.md` updated if a claim changes)
- Regression: POS sale, shop checkout, onboarding template save

## Decision needed

Stage 1–5 are implemented. Later items wait until these slices are used in anger. WhatsApp Cloud still needs Meta eligibility, approved templates, and a DPA before anyone should treat queued rows as delivered.
