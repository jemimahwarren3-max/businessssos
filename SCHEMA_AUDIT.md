# Schema audit (Kwetuu / BusinessOS)

Compared against the Cursor Build Guide’s suggested `stores` / `products` / `orders` names. **Do not create those tables.** This project already has a tenant model. Adapt code to the names below.

Staging project in use: `slajanbsfqjnuuiohbmg`. Production `maidxfntfpnkcqnuhozo` is not to be written without an explicit request.

## Guide name → existing name

| Guide                   | Existing                                                     | Notes                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `stores`                | `businesses` + `storefronts`                                 | One business (POS tenant). One storefront row keyed by `business_id`. Public handle is `storefronts.slug`.                                      |
| `stores.owner_id`       | `businesses.created_by` + `business_members`                 | Staff are members with roles, not only the owner.                                                                                               |
| `stores.handle`         | `storefronts.slug`                                           | Path shop: `/store/{slug}`. Subdomains exist in code behind `SHOP_HOSTS`, currently false on Cloud Run.                                         |
| `stores.template_id`    | `storefronts.template_id`                                    | Enum of ten ids in `src/lib/storefront/templates.ts`.                                                                                           |
| `stores.published`      | `storefronts.status`                                         | `draft` \| `published`.                                                                                                                         |
| `stores.payment_config` | `store_paynow_credentials.ciphertext`                        | Merchant Paynow keys, sealed. Platform billing keys are a different table (`subscription_payments`).                                            |
| `products.store_id`     | `products.business_id`                                       | Catalogue for POS and shop. Online visibility is `product_listings`.                                                                            |
| `product_variants`      | **absent as stock SKUs**                                     | Listings have `size_guide` / details text. Stock is one count per product (plus `product_stock` per location). Do not invent variant inventory. |
| `orders`                | `store_orders` (online) and `sales` (POS / recorded revenue) | Online checkout writes `store_orders`. Payment later can insert `sales` with `channel = 'online'`.                                              |
| `order_items`           | `store_order_items`                                          | Snapshot name/price/qty.                                                                                                                        |
| `delivery_zones`        | `storefronts.delivery` JSON                                  | Areas, fee, windows, hours — not a separate table.                                                                                              |

## Tenant key

Every merchant-owned table uses **`business_id`**, not `store_id`. Isolation is RLS plus `is_business_member` / `has_permission` RPCs. Regression: `tests/integration/tenant-isolation.test.ts`.

## Storefront tables (added 2026-10-19)

- `storefronts` — slug, template, branding, delivery JSON, payments JSON, status.
- `product_listings` — which catalogue products are on the shop (`published`, slug, min/max qty).
- `store_orders`, `store_order_items`, `store_order_events`.
- `store_paynow_credentials`, `shop_order_payments`.
- `store_complaints`, `store_reviews`, `store_listing_reports`.
- `locations`, `product_stock` — POS locations; default location for till.

Public reads go through security-definer RPCs (published storefronts only), not open `SELECT *` from the browser.

## Core POS tables (already existed)

`profiles`, `businesses`, `business_members`, `products`, `categories`, `customers`, `sales`, `sale_items`, `invoices`, `quotes`, `payments`, `expenses`, `inventory_movements`, `subscriptions`, `subscription_payments`, plus cash drawer, time clock, invites, audit logs, rate limits, legal acceptances, notification outbox.

## What the guide’s SQL must not do

- Do not `CREATE TABLE stores` or rename `business_id` → `store_id`.
- Do not add a parallel products table.
- Do not add Paynow keys as plaintext JSON on a public row.
- Do not introduce Prisma/Drizzle.
