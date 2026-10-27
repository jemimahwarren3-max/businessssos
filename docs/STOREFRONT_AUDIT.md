# BusinessOS storefront audit

Audit date: 2026-10-19. Branch at audit start: `master` (`90ddca4`), working tree clean. No application code or database was changed before this audit. The implementation that follows is additive and is documented in `docs/STOREFRONT.md`.

## 1. Executive summary

BusinessOS is not a Next.js application. It is a TanStack Start (React 19, Vite 8) app on Supabase Postgres, deployed as a Node server on Render. The existing product already runs a multi-tenant back office: products, stock movements, POS sales, invoices, quotes, customers, suppliers, purchase orders, expenses, reports, team roles, Paynow **subscription** billing, and WhatsApp **link** sharing.

There is no customer storefront, no product variants, no online-order table, and no per-merchant payment account. `create_sale` records a completed sale and deducts stock in one transaction. Reusing that function for unpaid online checkout would book revenue before money arrives. Online orders are therefore a separate ledger until a staff member records payment, which then inserts one `sales` row with `channel = 'online'`.

Paynow in this repository bills the BusinessOS Pro plan through one platform integration. It must not collect customer funds for every merchant. Customer checkout ships with pay on pickup, pay on delivery, and quote requests. Gateway checkout stays blocked until each merchant has an approved account.

## 2. Architecture map

```
Browser
  public routes (store, legal, auth)  -> TanStack Start server functions
  authenticated app (ssr: false, PWA) -> requireSupabaseAuth -> RLS-scoped Supabase client
        |                                         |
        v                                         v
  httpOnly sealed session cookie          Postgres RLS + security-definer RPCs
        |
        +-- service role (allowlisted only): Paynow subscription webhook,
            platform admin, account deletion, legal acceptance, team admin
Render (render.yaml) runs `node .output/server/index.mjs`
Supabase: auth, Postgres, no storage buckets in migrations
Optional: Upstash Redis workspace cache, Sentry, Groq
```

- Router: TanStack Router file routes in `src/routes`, generated `src/routeTree.gen.ts`.
- Styling: Tailwind CSS 4, Radix/shadcn components in `src/components/ui`, oklch tokens in `src/styles.css`.
- Validation: Zod plus `parseAndSanitize` (strips HTML).
- Money paths: security-definer SQL functions, not a chain of client writes. `create_sale` locks product rows with `FOR UPDATE`.

## 3. Feature inventory

| Feature                                       | Location                                                         | Preserved | Notes                                    |
| --------------------------------------------- | ---------------------------------------------------------------- | --------- | ---------------------------------------- |
| Marketing home                                | `src/routes/index.tsx`                                           | Yes       |                                          |
| Auth, reset, OAuth callback                   | `src/routes/auth.tsx`, `reset-password.tsx`, `auth.callback.tsx` | Yes       | Supabase Auth, httpOnly session          |
| Staff shop login                              | `src/routes/staff-login.tsx`                                     | Yes       | Shop password + staff code               |
| Dashboard, sales, sale history, refunds       | `_authenticated/dashboard.tsx`, `sales.tsx`, `sale-history.tsx`  | Yes       | Sales are completed revenue              |
| Inventory and categories                      | `inventory.tsx`, `products` table                                | Yes       | Storefront publishes these rows          |
| Invoices, quotes, recurring invoices          | `invoices.tsx`, `quotes.tsx`, `recurring-invoices.tsx`           | Yes       |                                          |
| Customers, suppliers, purchase orders         | matching routes                                                  | Yes       |                                          |
| Expenses, reports, insights                   | matching routes                                                  | Yes       | Reports sum `sales.total`                |
| AI assistant, quick add                       | `assistant.tsx`, `quick-entry-dialog.tsx`                        | Yes       |                                          |
| Team, permissions, audit log, billing, export | `settings.*`                                                     | Yes       |                                          |
| Time clock, commission                        | `time-clock.tsx`, `commission.tsx`                               | Yes       | Not in the main nav; linked elsewhere    |
| Platform admin                                | `src/routes/admin.tsx`                                           | Yes       | MFA + env user id                        |
| WhatsApp                                      | `src/lib/whatsapp.ts`                                            | Yes       | `wa.me` links only. Nothing is auto-sent |
| Paynow subscriptions                          | `src/lib/payments/paynow.server.ts`, `src/server.ts`             | Yes       | Platform billing only                    |

No route was deleted. Suspected gaps (no variants, no storefront, CI listening for `main` while the branch is `master`) were confirmed by reading the repo.

## 4. Database map

Tenant root: `businesses` 1—n `business_members`. Catalogue: `categories`, `products` (one price, one `stock` number, `cost_price`, `image_url` text), `suppliers`. Stock history: `inventory_movements`. Commerce: `sales` + `sale_items` + `payments`, `sale_refunds`, `invoices`, `quotes`, `customers`. Purchasing: `purchase_orders`. Billing: `subscriptions`, `subscription_payments` (Paynow poll URL). Access: `permissions`, `business_role_permissions`.

There is no cart, variant, collection, delivery-zone, or customer-order table in the pre-storefront schema. `sale_status` is only `completed | refunded | partially_refunded | cancelled`.

## 5. Security findings

| Severity | Evidence                                                                                                                           | Impact                                                                                                     | Remediation                                                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| High     | `businesses.staff_password_hash` is on a table members can `SELECT`. RLS is row-level. `data-export.server.ts` used `select("*")`. | Any member, including a cashier, could read the shop-password hash.                                        | This change revokes `SELECT` on that column from `authenticated` and `anon`, and the export lists columns explicitly. Login functions stay security-definer. |
| High     | `create_sale` used the client `unitPrice` when supplied.                                                                           | A staff session could record a sale at an arbitrary price.                                                 | POS now uses catalogue `selling_price` and `sales.create`. Online orders already priced in SQL.                                                              |
| High     | One `PAYNOW_INTEGRATION_ID` in the server environment.                                                                             | Using it for shopper checkout would mix merchant funds into the platform account.                          | Not used for storefront orders.                                                                                                                              |
| Medium   | Public product reads must not use the member `products` policy, which includes `cost_price` and `supplier_id`.                     | A public query would leak cost and supplier data.                                                          | Public catalogue is a security-definer function that returns a fixed field list. No anon table grants.                                                       |
| Medium   | Order references are sequential (`ON-0001`).                                                                                       | The reference alone must not open an order.                                                                | Status reads require a bcrypt-checked access code. The code is not put in the URL.                                                                           |
| Low      | CI (`.github/workflows/ci.yml`) triggers on `main`. The default branch is `master`.                                                | GitHub Actions may not run on this repo's real branch.                                                     | Left unchanged. Confirm the default branch before relying on CI.                                                                                             |
| Low      | `create_sale` idempotency check is not locked before insert.                                                                       | Two parallel POS submits can still race; the unique index prevents duplicates but one request errors.      | Online checkout takes a transaction advisory lock on the idempotency key. POS was not rewritten.                                                             |

No live secrets were found in the tree. `.env.example` contains empty placeholders. Integration tests target a hardcoded staging project ref and refuse to run without `SUPABASE_ACCESS_TOKEN`.

## 6. Broken, incomplete, duplicated, or risky behaviour

- Storefront, variants, bundles, discount codes, and digital delivery do not exist.
- Wishlist, product comparison, and automated WhatsApp are not implemented and are not faked.
- `sale_status` cannot represent "awaiting payment" without changing every report that treats non-cancelled sales as revenue.
- Images are a single URL string. There is no storage bucket migration.
- Billing is a single Pro plan at 3 USD (`src/lib/billing-plans.ts`). No second billing system was added.
- Leaked-password protection is off because the Supabase projects are on the free tier (`SECURITY.md`).

## 7. Storefront gap

The merchant can already manage products and stock. Customers cannot browse or buy them. The safe bridge is: publish a product listing that points at `products.id`, price and stock stay on that row, and an online order reserves stock without inserting `sales` until payment is recorded.

## 8. Implementation sequence

1. Audit and baseline (this document).
2. Additive migration: storefront, listings, orders, column lock on the shop-password hash, `sales.channel`.
3. Shared renderer and ten layouts over one component tree.
4. Public catalogue, cart quote, guest checkout.
5. Merchant setup, preview, publish, order actions.
6. Paynow customer checkout: blocked until per-merchant credentials exist. Do not reuse the platform keys.
7. Email and WhatsApp Business API: not started. WhatsApp remains a `wa.me` link.

## 9. What is reused

Products, categories, stock, inventory movements, sales, payments, refunds, customers (not required for guest checkout), permissions (`business.settings`, `sales.create`, `payments.record`), audit log, notifications, rate limiter, sanitizer, and the existing Paynow subscription code.

New tables: `storefronts`, `product_listings`, `store_orders`, `store_order_items`, `store_order_events`.

## 10. External blockers

- Apply `supabase/migrations/20261019090000_storefront.sql` to the Supabase project. This environment has no `SUPABASE_ACCESS_TOKEN`, so the migration was not executed.
- Paynow merchant account per business, plus a decision on whether BusinessOS may store integration keys. Marketplace split is not in the Paynow quickstart that was read (integration id and key from the merchant dashboard; Node guide linked from the hub).
- `APP_URL` must be the public origin before the sitemap emits absolute URLs.
- Email provider: none configured.
- WhatsApp Business Platform: not approved; do not automate sends.

## Baseline

- `tsc --noEmit`: passed before these changes.
- Unit tests (`vitest`, excluding `tests/integration`): 33 passed.
- One integration file: failed locally with `Missing SUPABASE_ACCESS_TOKEN`. That failure is pre-existing and was not treated as a product bug.
- Lint on a sample of existing files: passed.
- Full `npm run build` was not part of the pre-change baseline because it needs Supabase env vars at build time (CI provides them).
