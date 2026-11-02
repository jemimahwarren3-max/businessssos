# Database gap analysis

**Date:** 2 November 2026  
**Rule:** do not duplicate tables. Extend existing money, stock, and order models.

## What already carries the business

| Domain | Tables / RPCs | Notes |
| ------ | ------------- | ----- |
| Tenant | `businesses`, `business_settings`, `business_members`, `subscriptions` | `timezone`, `tax_mode`, `currency` exist |
| Catalogue | `products`, `product_listings`, `product_stock`, `product_media` | Single price; stock total + per location |
| POS | `sales`, `sale_items`, `sale_refunds`, `payments`, `create_sale` | One `payment_method` per sale |
| Credit | `customers.outstanding_balance` | No ledger of movements |
| Suppliers | `suppliers`, `purchase_orders`, `purchase_order_items` | `outstanding_amount` unused |
| Expenses | `expenses` | |
| Till | `cash_sessions`, `cash_movements` | Cash only |
| Shop orders | `storefronts`, `store_orders`, `store_order_items`, `store_order_events` | One payment method |
| Manual / Paynow | `shop_order_payments`, `store_order_payment_confirmations`, `store_paynow_credentials` | Proof ≠ paid |
| Trust | `store_reviews`, complaints, listing reports | Verified purchase |
| Fulfilment | Delivery JSON on storefront, collection points, courier text fields | Stage 8 SQL |
| Growth | `storefront_analytics_events`, `store_marketing_campaigns` | |
| Staff | permissions, invites, `audit_logs`, time entries | |
| FX | `platform_fx` | Singleton, billing display |
| Outbox | `notification_outbox` | `channel = 'email'` |

RLS pattern that new money features must copy: authenticated **SELECT** for members; **writes in `SECURITY DEFINER` RPCs** with `assertPermission` / `storefront_require_*`. Cash drawer (`20261019200000_pos_cash_drawer.sql`) is the template.

## Gaps vs the 100 (schema only)

### Stage 1 — prefer columns and RPCs, not new domains

| Need | Proposed change | Do not |
| ---- | --------------- | ------ |
| Named rails | Optional `payments.rail text` (`ecocash`, `innbucks`, `zipit`, `bank`, `cash_usd`, …) **or** map in the app from `method` + note | New `payment_methods` app |
| Cashier totals | RPC `get_daily_takings(business_id, day)` grouping `payments` + cash movements | A reporting warehouse |
| Credit repayment | RPC `record_customer_credit_payment` inserting `payments` (sale_id or customer_id) and decrementing `outstanding_balance` | A second balance column |
| Credit book UI | View/RPC listing customers with balance, last payment, last sale | Duplicate of `invoices` |
| WhatsApp share | No DB | Do not store outbound WA until Cloud exists |
| Low stock home | Use `products.min_stock` / existing dashboard payload | New alert table |

Integrity: repayment amount > 0, amount ≤ outstanding, idempotency_key unique, permission `payments.record`, audit log.

### Stage 2 — split tenders and multi-currency

| Need | Proposed change | Risk |
| ---- | --------------- | ---- |
| Split POS | Allow **several** `payments` rows per `sale_id` whose sum equals `sales.total`; relax “one method” in `create_sale` | Till expected cash must sum only cash tenders |
| Shop split | Harder; keep shop orders single-method until POS split is proven | |
| FX ledger | `fx_rates(business_id, base, quote, rate, source, captured_at)` + store `amount_original`, `currency_original` on `payments` | Never update historical rows when the rate changes |
| ZiG shop Paynow | Drop or gate the USD-only trigger only after a real provider test | Money bugs |

### Stage 3 — deposits, lay-by, supplier book

| Need | Proposed change |
| ---- | --------------- |
| Supplier debt | Write `suppliers.outstanding_amount` from PO receive / supplier payment RPC (column already there) |
| Deposits | `customer_deposits` or `orders.deposit_amount` + allocations. Prefer a small table with status `held` / `applied` / `refunded` |
| Lay-by | `laybys` + `layby_instalments` with due dates and “collect when paid ≥ threshold”. Do not fake with invoices |

### Later

| Need | Proposed change |
| ---- | --------------- |
| Variants | `product_variants` with own sku/stock — large; isolate from money work |
| Bundles / price breaks | Child tables off `products` |
| Coupons / loyalty | New domains; not Stage 1–3 |
| Branch transfers | `stock_transfers` + movements (`20261019180000` already warned this is missing) |
| WhatsApp Cloud | `notification_outbox.channel = 'whatsapp'` + provider message id |
| Country packs | `platform_country_settings` (see market requirements) |
| Multi-business | Stop collapsing memberships in `loadWorkspace`; add `active_business_id` on profile |

### Stage 4 — client only

No Postgres. IndexedDB `businessos-offline` version 2 adds `posDrafts`. Do not drop `pendingSales`. Low-data preference is `localStorage`.

## Existing columns that look like features but are idle

| Column | Issue |
| ------ | ----- |
| `suppliers.outstanding_amount` | Never updated in app SQL paths reviewed |
| `platform_fx.usd_to_zwg` | Easy to misuse for shop conversion — document in every FX PR |
| `businesses.timezone` | Onboarding does not reliably set it |
| `product_stock.location_id` | POS still hits default location |

## Indexing / performance

- `payments (business_id, paid_at desc)` already exists — daily takings can use it.
- Credit book: index `customers (business_id, outstanding_balance)` where balance > 0 if missing.
- Do not add rate-limit INSERTs on public browse (already burned in `browse_marketplace`).

## RLS checklist for any money RPC

1. `auth.uid()` membership.
2. Permission key (`payments.record`, `cash.drawer`, `sales.create`).
3. Billing/operate gates already wrapping `create_sale` — do not bypass.
4. Idempotency.
5. `recordAudit`.
6. No service-role in the browser.
7. Staging integration test with two tenants (see `tests/integration/tenant-isolation.test.ts`).
