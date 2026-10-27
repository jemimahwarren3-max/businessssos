# Storefront

The online shop publishes existing `products` rows. It does not keep a second catalogue.

## Apply the database change

Run `supabase/migrations/20261019090000_storefront.sql` on the Supabase project you use for this environment (staging first). The app shows “the online shop database update has not been applied yet” until that migration exists. Do not run it against production until you have reviewed it. Rollback notes are at the bottom of the migration. Do not drop the new tables after real online orders exist.

The migration also stops signed-in members from reading `businesses.staff_password_hash`. Shop login still works through the existing security-definer functions.

Apply `20261019140000_storefront_order_rules.sql` after the marketplace and host-slug migrations. That snapshot stores the agreed cash, delivery, and acceptance rules on each order.

Apply `20261021150000_storefront_template_library.sql` after the existing storefront migration. It expands the template allow-list and persists seller theme settings without changing products or orders.

## Order and stock rules

- A normal order locks product rows, checks `selling_price` and stock on the server, and decrements stock. It writes `inventory_movements` with `reference_type = 'store_order'`.
- It does not insert into `sales` or `payments`. Reports that sum sales do not treat it as revenue.
- Pay on pickup and pay on delivery stay `payment_status = unpaid` until a staff member with `payments.record` chooses Record payment. That inserts one sale with `channel = 'online'` and does not deduct stock again.
- Cancelling before that sale restores stock. After the sale exists, use Sales history refunds. Cancelling here is refused so stock is not returned twice.
- Quote requests do not reserve stock until Accept quote.
- If the merchant requires a delivery quote, priced delivery checkout is refused. The customer can request a quote instead.
- Delivery checkout accepts a free-text location (up to 300 characters); customers can include their suburb or area, street/stand number, nearby landmark, and rider directions.
- If the merchant turns on automatic acceptance, eligible non-quote orders start as `confirmed`. They stay `unpaid` until Record payment.
- Changing delivery fees or cash rules later does not rewrite `store_orders.terms` or the stored totals.
- Repeating checkout with the same idempotency key returns the original order and does not reserve stock again. The access code is only returned on the first response; the browser stores it for that tab.
- Customer order pages need the access code. The order number is not enough.

## Payments

Platform Paynow keys (`PAYNOW_INTEGRATION_ID` / `PAYNOW_INTEGRATION_KEY`) remain for BusinessOS subscription billing only. Customer checkout cannot mark itself paid by redirect. Paynow, EcoCash, and InnBucks are not offered until each merchant connects an approved account of their own.

## Store builder (Stage 3)

Merchants open **My Online Store → Store builder** (`#store-builder`) for a tabbed workflow: **Design** (three layout families: Modern Minimal, Bold Commerce, Local Business), **Branding** (colours, fonts, logo/banner upload or HTTPS URLs), **Products** (Stage 2 online catalogue), **Store information** (contact, delivery, manual payment instructions), and **Preview** (desktop/mobile, live draft using published listings only). **Save draft** persists through `save_storefront`; **Discard changes** reverts unsaved edits. Logo and banner uploads use the `product-media` bucket at `{businessId}/storefront/{logo|cover}/…` with existing member RLS.

## Templates

Sixty storefront designs (six each in ten retail categories) share one renderer (`src/components/storefront/store-experience.tsx`) and one template registry (`src/lib/storefront/templates.ts`). Sellers can filter/search the gallery, preview their published products on desktop or mobile, customize palettes, color tokens, type pairing, logo, cover image, and section visibility, and save those settings to their own store. Changing template does not copy products or orders. Gallery sketches are labelled sample layouts; the seller's draft preview uses their actual published catalogue.

The content editor also supports an announcement bar, category-based collections, promotional tiles, FAQs, separate delivery/returns/privacy notes, and editable contact/social links. Apply `20261022100000_storefront_content_sections.sql` after the storefront template migration to persist these sections. Shop addresses link to a map search generated from the seller-entered address; no device location is collected.

Published products support up to eight additional storefront photos beside the existing inventory photo. Apply `20261022110000_storefront_product_gallery.sql` after the content sections migration. Gallery photos use the existing product-media bucket and are returned through the storefront RPCs; they do not create separate catalogue items.

Product photos selected in Inventory or the storefront gallery are resized to a maximum 1200-pixel dimension and converted to WebP on the device when supported. The server still validates the final image type and enforces the 2 MB upload limit; browsers without image conversion support can upload an already-small supported image unchanged.

Inventory remains the source of product identity, stock, price, and business currency. The Storefront page manages online visibility, customer-facing name and description, existing business categories, and storefront gallery photos without creating duplicate products or changing internal inventory notes. A product is ready to list only when it has a positive selling price, a photo, and a customer-facing description. Products created during onboarding stay in Inventory until the seller completes those online details.

Apply `20261027130000_storefront_product_management.sql` after the product-gallery migration, on staging first. It adds customer-facing product names, category assignment with business-ownership validation, and server-side protection against publishing inactive or zero-price products. It also updates public storefront and marketplace payloads to use the customer-facing description rather than internal inventory notes. The migration unpublishes any existing listing whose inventory selling price is zero or less; review those listings after applying it.

The marketplace searches products across listed shops and lets shoppers narrow those results to a preferred shop. Checkout remains within the selected shop and does not combine orders from multiple businesses.

There are no purchasable variants. Size, shade, and ingredient text are merchant notes on the single product stock count. Wishlists and recently viewed shelves are currently stored in the shopper's browser per shop; they are not account-synced. Newsletter signup and an interactive unsaved storefront preview are not implemented.

## Routes

- Merchant: `/storefront`
- Public shop: `https://{slug}.{APP_URL host}/`, plus `/products/{product}`, `/cart`, `/checkout`, `/order/{reference}`, and `/search` on that same host. In dev that is `http://{slug}.localhost:8080/`.
- Older `/store/{slug}` addresses on the platform host redirect there, except draft preview.
- Public directory: `/market` on the platform host. Only published shops with marketplace visibility on. Checkout stays on the individual shop. Apply `20261019110000_marketplace_browse.sql` after the storefront migration.
- Draft preview: `/store/$slug?preview=1` on the platform host, for a signed-in member of that business. Everyone else gets a not-found page. Preview is not moved to the shop subdomain, because the sign-in cookie is not sent there.
- `/sitemap.xml` lists published shop subdomains when `APP_URL` is set.
- Production needs a wildcard DNS record for `*.yourdomain` pointing at this service. The app cannot create that record.
- Apply `20261019120000_storefront_host_slugs.sql` so labels such as `www`, `app`, `market`, and `mail` cannot be chosen as shop names.
