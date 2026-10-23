# Kwetuu architecture

## Current shape

- **Web application:** TanStack Start with React, TypeScript, Vite and Zod.
- **Persistence and identity:** Supabase Auth and Postgres. SQL migrations define
  tables, RPCs, triggers, row-level security and grants.
- **Server boundary:** TanStack server functions and server-only modules. Public
  checkout uses database RPCs for price calculation, order snapshots and stock
  reservation; seller operations use authenticated sessions, membership/
  permission checks and database authorization.
- **Commerce:** Merchant products and stock are shared with online orders. The
  public shop and marketplace read storefront/product data; checkout creates a
  `store_orders` record and immutable `store_order_items`.
- **Payments:** manual seller payment/proof flow; separate platform
  subscription Paynow; existing per-shop Paynow code, which this branch is
  restricting behind global approval and stronger verification.
- **Deployment:** GitHub Actions builds and deploys to Cloud Run. Current deploy
  wiring targets the staging Supabase project; it does not itself establish a
  production database deployment.

## Ownership and trust boundaries

Every business-owned record must be scoped by `business_id`. Browser requests
must not be trusted for price, payment status, business ownership, or
subscription entitlements. Service-role access stays in server-only modules.
Public access is through narrowly scoped RPCs; sensitive mutations require
membership/permission checks and database-side validation.

## Payment slice added in this branch

The new migration adds a default-off Paynow provider control, an immutable
seller-payment confirmation record, restrictions on manual settlement of
Paynow orders, USD validation, and stricter verified-payment confirmation.
Shop credentials use a dedicated, versioned AES-256-GCM key, separate from
session signing. Paynow polling is bounded, HTTPS-host allowlisted, and checks
the signed response reference and amount.

The change is additive. It has not been applied to staging or production; live
seller Paynow is not enabled. Database integration and upgrade behavior still
need staging verification.

## Architectural gaps / constraints

- Single-shop cart; no marketplace split settlement or platform commission.
- No general provider-adapter framework, complete payment ledger/refund
  workflow, or automatic reconciliation worker.
- No product variants; location/branch functionality is incomplete.
- Custom shop subdomains require operator DNS/TLS configuration.
- Browser end-to-end coverage and production restore evidence are absent.

For operational details see [Data flow](./DATA_FLOW.md),
[deployment and rollback](./DEPLOYMENT_AND_ROLLBACK.md), and
[privacy architecture](./PRIVACY_ARCHITECTURE.md).
