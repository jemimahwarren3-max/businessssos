# Storefront

The online shop publishes existing `products` rows. It does not keep a second catalogue.

## Apply the database change

Run `supabase/migrations/20261019090000_storefront.sql` on the Supabase project you use for this environment (staging first). The app shows “the online shop database update has not been applied yet” until that migration exists. Do not run it against production until you have reviewed it. Rollback notes are at the bottom of the migration. Do not drop the new tables after real online orders exist.

The migration also stops signed-in members from reading `businesses.staff_password_hash`. Shop login still works through the existing security-definer functions.

## Order and stock rules

- A normal order locks product rows, checks `selling_price` and stock on the server, and decrements stock. It writes `inventory_movements` with `reference_type = 'store_order'`.
- It does not insert into `sales` or `payments`. Reports that sum sales do not treat it as revenue.
- Pay on pickup and pay on delivery stay `payment_status = unpaid` until a staff member with `payments.record` chooses Record payment. That inserts one sale with `channel = 'online'` and does not deduct stock again.
- Cancelling before that sale restores stock. After the sale exists, use Sales history refunds. Cancelling here is refused so stock is not returned twice.
- Quote requests do not reserve stock until Accept quote.
- Repeating checkout with the same idempotency key returns the original order and does not reserve stock again. The access code is only returned on the first response; the browser stores it for that tab.
- Customer order pages need the access code. The order number is not enough.

## Payments

Platform Paynow keys (`PAYNOW_INTEGRATION_ID` / `PAYNOW_INTEGRATION_KEY`) remain for BusinessOS subscription billing only. Customer checkout cannot mark itself paid by redirect. Paynow, EcoCash, and InnBucks are not offered until each merchant connects an approved account of their own.

## Templates

Ten layouts share one renderer (`src/components/storefront/store-experience.tsx`) and one template list (`src/lib/storefront/templates.ts`). Changing template does not copy products or orders. Gallery thumbnails are labelled sample layouts, not live products.

There are no purchasable variants. Size, shade, and ingredient text are merchant notes on the single product stock count.

## Routes

- Merchant: `/storefront`
- Public shop: `/store/$slug`, `/store/$slug/products/$productSlug`, `/store/$slug/cart`, `/store/$slug/checkout`, `/store/$slug/order/$reference`, `/store/$slug/search`
- Public directory: `/market`. Only published shops with marketplace visibility on. Checkout stays on the individual shop. Apply `20261019110000_marketplace_browse.sql` after the storefront migration.
- Draft preview: `/store/$slug?preview=1` for a signed-in member of that business. Everyone else gets a not-found page.
- `/sitemap.xml` lists published shops when `APP_URL` is set.
