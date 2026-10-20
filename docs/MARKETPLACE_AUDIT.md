# Marketplace audit

Inspected the current BusinessOS repository before adding a public directory. The stack stays TanStack Start, Vite, and Supabase. This is not a rebuild.

## What already works

- Merchant tools: inventory, POS sales, invoices, quotes, customers, expenses, reports, staff roles, and granular permissions enforced with `has_permission`.
- One product catalogue. A published online listing points at an existing `products` row. Cost price and supplier stay off the public payload.
- Ten storefront templates share one renderer. Draft preview is members-only. Publish requires a real fulfilment and payment path.
- Online orders reserve stock in `inventory_movements` and do not book revenue until a staff member records payment. That inserts one `sales` row with `channel = 'online'` and does not deduct stock again.
- Guest checkout supports pay on pickup, pay on delivery, and quote requests. Paynow remains platform subscription billing only.
- Public shop URLs are `{slug}.{platform host}`. The pages are still implemented as `/store/$slug`. Sitemap lists published shop subdomains when `APP_URL` is set.

## What is partial

- The storefront migration `20261019090000_storefront.sql` is in the repo. It has not been confirmed against staging or production from this environment. Until it is applied, shop and marketplace pages report that the database update is missing.
- Size, shade, and ingredient text are notes on one stock count. There are no purchasable variants, multiple images, or CSV marketplace import.
- Customer checkout is one shop at a time. Cart data lives in the browser for that shop.

## What was missing for the marketplace

- No page where a shopper can see more than one business.
- No cross-store search.
- No merchant choice to stay off a shared directory while keeping a public shop link.
- No customer accounts, reviews, wishlists, or multi-shop checkout. Those stay out of this stage.

## What must be reused

- Published `storefronts` and `product_listings`.
- Server prices and stock labels from the same rules as the shop (`selling_price`, low-stock wording, no exact quantity above 10).
- Existing shop product, cart, and checkout pages. The directory links to each shop's subdomain. It does not create a second order system.

## What this stage adds

- `/market` lists shops that are published and marked visible in the directory.
- Search matches shop name, tagline, address, and product name or description. Category filters use real category names.
- “Featured by the shop” uses the merchant’s featured flag. “Recently published” uses listing time. Nothing is labelled trending, popular, or rated.
- Merchants with `business.settings` can hide a shop from the directory without unpublishing its own link.
- A cart that mixes three shops is not offered. Each product opens that shop’s own cart.

## Still blocked

- Customer Paynow, EcoCash, and InnBucks until each merchant has an approved account. Do not reuse platform Paynow keys.
- Variants, reviews, commissions, featured-ad billing, and customer accounts.
- Applying migrations to production. Apply staging first and review before production.

## Later stages

1. Richer discovery only from measured data (views, completed orders), still without invented counts.
2. Customer accounts and order history tied to the existing access-code orders.
3. Multi-shop checkout as separate merchant orders, settlements, and refunds.
4. Marketplace commission only after payments and payouts are real.
