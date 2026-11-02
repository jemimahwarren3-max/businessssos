# Implementation roadmap

**Date:** 2 November 2026  
**Status:** Stage 1 (Morning desk) implemented on this branch. Later stages still wait for approval.

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

## Stage 2 — How people actually pay

- Split tenders on POS (`payments` rows sum to sale total).
- Cash-up expected cash = cash tenders only.
- Optional `payments.currency` + original amount (still no silent FX).
- Shop checkout stays single-method until POS split is stable.

## Stage 3 — Notebook and delivery

- Supplier outstanding hooked to POs.
- Deposits.
- Lay-by.
- Harare / Bulawayo / Mutare zone presets (data).
- Public verified-store badge on `/market`.
- Optional wholesale price column.

## Stage 4 — Offline income protection

- Snapshot in-progress POS cart for power loss.
- Offline stock honesty in the UI (“estimate”).
- Sync dead-letter that a cashier can retry without a developer.
- Low-data mode (defer images).

## Stage 5 — Messaging as a channel (vendor required)

Only after Meta eligibility and legal:

- `notification_outbox` WhatsApp channel.
- Opt-in marketing.
- Order status templates.
- Still no fake “sent” state.

## Later (do not schedule until Stages 1–3 are used in anger)

Coupons, loyalty, abandoned cart, posters, voice, diaspora, B2B marketplace, peer benchmarks, academy, Shona/Ndebele, branch transfers, product variants/bundles, EcoCash/InnBucks APIs.

## Definition of done for every future stage

Copied from the brief; this is the bar:

- Database migration + staging-manifest `skipIf`
- RLS / security-definer RPCs
- Full UI workflow, including mobile width
- Validation, loading, empty, failure
- Integration test where money or tenants are involved
- Documentation (`KNOWN_LIMITATIONS.md` updated if a claim changes)
- Regression: POS sale, shop checkout, onboarding template save

## Decision needed

Approve **Stage 1 — Morning desk**, a smaller subset, or a different first slice.

Until then, no feature PRs from this audit.
