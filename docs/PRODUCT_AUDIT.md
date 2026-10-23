# Kwetuu product audit

**Snapshot:** 23 October 2026, branch `feature/payments-foundation`, based on
`7dd36ba`. This is a repository-level product audit, not a live-system test,
penetration test, legal opinion, or restore drill.

## Product and stack

Kwetuu combines the existing BusinessOS merchant application with Supabase
Auth/Postgres, a public storefront and marketplace, and Cloud Run deployment.
The application uses TanStack Start, React, Vite, TypeScript, Zod, and Vitest.
The repository contains 64 SQL migrations at this snapshot.

## What the repository supports

| Area                    | Repository evidence                                                                                                                                               | Qualification                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Merchant operations     | Authenticated dashboard routes for products/inventory, POS/sales, customers, suppliers, purchasing, invoices/quotes, expenses, reports, team, audit, and settings | Features vary in completeness; see `BUSINESSOS_AUDIT.md` and `KNOWN_LIMITATIONS.md`.                        |
| Storefront              | Public store, product, cart, checkout, order and account routes; 60 existing template IDs                                                                         | Wildcard DNS/TLS is an operator requirement; no product variants.                                           |
| Orders                  | SQL-priced checkout, immutable order item snapshots, idempotency and shared stock handling                                                                        | Checkout supports a single shop per cart.                                                                   |
| Seller payments         | Manual instructions, buyer proof upload and seller confirmation; existing seller Paynow code                                                                      | Manual proofs are not payment verification. Automated seller Paynow remains approval-gated and is not live. |
| Platform billing        | Subscription records and platform Paynow flow                                                                                                                     | Cloud Run deploy defaults billing off; this is separate from seller checkout.                               |
| Discovery and trust     | Marketplace routes, verified-purchase reviews and seller replies                                                                                                  | No commission or multi-shop cart.                                                                           |
| Notifications           | Email outbox and Resend flush workflow                                                                                                                            | Delivery depends on verified sender and configured secrets/job.                                             |
| Administration/security | Business roles/permissions, RLS, rate limits, audit events, platform admin paths                                                                                  | This audit did not perform live adversarial or tenant-isolation testing.                                    |

## Gaps and risks

- Public production readiness is not established: staging schema and end-to-end
  operations must be validated; DNS/TLS, backups/restore, legal/fiscal duties,
  accessibility, and dependency risk remain separate gates.
- Product variants, branch transfers, multi-store carts, automated fulfilment
  tracking, mature refund/reconciliation operations, and provider adapters for
  EcoCash/InnBucks are not established as complete.
- Existing per-shop Paynow needs written provider/platform approval and legal
  review before enablement. Seller credentials alone must not activate it.
- Payment work in this branch is not yet applied to staging and is uncommitted.
- No end-to-end browser test suite is configured; many staging integration
  tests require the staging Management API token.

## Safest immediate implementation

Continue the additive payment-safety slice already in progress: preserve manual
checkout, audit seller confirmation, block manual settlement of Paynow orders,
validate Paynow polling/callback data, and default automated seller Paynow off.
Do not route seller proceeds through Kwetuu's subscription account. Do not apply
this migration to production.

See [the full 23 October audit](./KWETUU_FULL_AUDIT_2026-10-23.md),
[the feature audit](./BUSINESSOS_AUDIT.md), and
[the payment readiness audit](./KWETUU_PAYMENTS_AUDIT_AND_READINESS.md) for
existing detailed evidence and constraints.
