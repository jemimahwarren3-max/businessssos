# Remaining roadmap, batched

The original 200-item list is not a launch checklist. After storefront, marketplace, subdomains, production docs, order rules, UI reuse, and legal plus complaints, most of those items are still missing on purpose. This file groups what is left into slices that can be finished honestly. Do not stub a whole batch as empty screens.

Counts are approximate. Many "features" in the original list are the same capability named twice (core vs retention).

## Already shipped (do not rebuild)

| Slice                                                                             | Proof                     |
| --------------------------------------------------------------------------------- | ------------------------- |
| Merchant POS, stock, sales, invoices, quotes, CRM, expenses, roles, audit, export | Existing app              |
| Public shop, templates, cart, server-priced checkout, access-code tracking        | Storefront migrations     |
| `{slug}` shop hosts, marketplace directory                                        | Host rewrite + browse RPC |
| Cash, quote-required delivery, auto-accept, terms snapshot                        | Order-rules migration     |
| TanStack Table + RHF on real forms                                                | Open-source tooling PR    |
| Privacy/Terms drafts, complaint form tied to order token                          | Legal PR                  |
| Verified-purchase reviews and listing reports                                     | Marketplace trust PR      |
| In-app shop alerts plus optional Resend outbox                                    | Notifications PR          |
| Default-location stock (`locations` / `product_stock`)                            | Locations PR              |
| Shop hours, cut-off, collection windows                                           | Fulfilment clocks PR      |
| POS cash drawer ledger                                                            | Cash control PR           |
| Shopper login, order history, per-shop message consent                            | Shopper accounts PR       |

## Batch 1: marketplace trust (shipped)

Verified-purchase reviews and listing reports. Reviews require the order access code and a line that was actually ordered. No star averages with zero reviews. No identity badges.

## Batch 2: merchant notifications (shipped)

In-app alerts for new orders, complaints, reviews, listing reports, and low-stock crossings. Email copies through Resend only when `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL` are set. Outbox is retry-safe. WhatsApp Cloud is not used.

## Batch 3: staging `locations` drift (shipped)

`locations` and `product_stock` are in git. POS, imports, and shop stock changes use the default location when the app does not send `_location_id`. `products.stock` is the sum across locations. Branch transfers are still not built.

## Batch 4: fulfilment clocks (shipped)

Structured weekday hours, a HH:MM cut-off, and collection windows are stored on `storefronts.delivery` and enforced in `quote_store_cart` / `create_store_order`. Pickup slots are required only after windows are saved. Free-text hours stay a shop note. Quote requests skip the clocks.

## Batch 5: POS cash control

One open cash session per business, a signed `cash_movements` ledger, cash POS sales and cash refunds that refuse without an open till, and a close that stores counted versus expected. Invoice cash and online shop cash are not in this till.

## Batch 6: variants and merchandising

Size/colour variants with real stock rows. Collections and scheduled publish. Blocked until stock is no longer a single `products.stock` number (or that model is explicitly kept and variants are refused).

## Batch 7 (this PR): customer accounts

Shopper login on `/store/$slug/account` (and `/account` on the shop host). Checkout still works as a guest. Orders attach only when `auth.uid()` is present at place-order time, or when a signed-in shopper claims a guest order with the access code. Matching email does not attach an order. Access codes stay valid after a claim. Message consent is stored per shop; no shopper email is sent.

## Batch 8: shopper payments

Per-merchant Paynow/EcoCash. Never platform subscription keys. Server-side confirmation. Refunds and settlement files after the charge path exists.

## Batch 9: purchasing depth

GRN against POs, supplier invoices, supplier returns, reorder suggestions from real movement history.

## Batch 10: files and media

Storage bucket, product photos without raw URL-only, expense documents. RLS on objects. Virus/size limits.

## Batch 11: tax and fiscalisation

ZIMRA / invoice legal rules only with a named integration and lawyer input. Do not label configurable tax rates as fiscalised.

## Batch 12: custom domains and SEO extras

Merchant CNAME, TLS, social images. Operator DNS work. Not a UI field that pretends the host works.

## Batch 13: search quality

Better category filters and merchandising. Stay on Postgres `ilike` until catalogue size proves it is slow. Do not add Meilisearch for a few hundred products.

## Batch 14: retention ledgers (blocked)

Loyalty points, coupons, gift cards, store credit, wishlists, referral credit. Need a signed ledger, expiry, fraud controls, and tax treatment. Do not draw a points badge.

## Batch 15: marketplace growth (blocked or operator)

Sponsored listings, popularity ranks, verified-merchant badges, usage-based billing dashboards, n8n automations. Badges only after a real check. Sponsored slots only after a payment path.

## Batch 16: production go-live

Path-based shops and a Cloud Run workflow are in git (`CLOUD_RUN_LAUNCH.md`). Operator still must create the GCP project, secrets, and (later) wildcard DNS. Backup restore, `npm audit` upgrades, legal entity name, and CDPA review stay human gates. Production Postgres is not applied from this agent. See `PRODUCTION_GO_LIVE_CHECKLIST.md`.

## Explicitly out of scope until a human asks

Medusa, Saleor, WooCommerce, Umami, Storybook, dnd-kit as a second inventory UX, MinIO next to Supabase storage, customer Paynow with platform keys, fake charts, dead buttons.

## Next after this PR

Operator: GitHub/GCP secrets and a staging Cloud Run revision. Do not wait on variants or shopper Paynow to do that. Production database cutover still needs an explicit human.
