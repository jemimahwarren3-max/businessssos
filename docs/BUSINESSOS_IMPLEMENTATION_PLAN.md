# BusinessOS implementation plan

## Goal of this increment

Merchants configure cash, delivery, and acceptance rules once. Checkout only offers options the merchant enabled. Postgres enforces those rules and snapshots them on the order so later setting changes do not rewrite history. Customer Paynow stays off.

This is Phase 4 of the master prompt (online orders and fulfilment), sliced to what can be completed honestly on the current stack.

## Why not the rest of the 200

Variants, branches, reviews, loyalty, gift cards, and customer Paynow each need schema, permissions, and fraud controls. Building them as UI-only would violate the constitution. See `BUSINESSOS_AUDIT.md`.

## Dependencies

1. Storefront migration `20261019090000_storefront.sql` (already on staging).
2. Marketplace `20261019110000_marketplace_browse.sql`.
3. Host slugs `20261019120000_storefront_host_slugs.sql`.
4. **This slice:** `20261019140000_storefront_order_rules.sql`. Applied on staging `slajanbsfqjnuuiohbmg` (column `store_orders.terms` and normalise functions confirmed). Not applied to production.

## What this slice delivers

| Behaviour | Where |
|---|---|
| Normalise delivery/payments JSON (quoteRequired, autoAccept, cashCurrencies, exactCash, changeProvided, prep/cutoff/windows) | `storefront_normalize_*`, `save_storefront` |
| Refuse priced delivery when quoteRequired | `quote_store_cart`, `create_store_order` |
| Auto-accept eligible non-quote orders as `confirmed` still `unpaid` | `create_store_order` |
| Snapshot terms on `store_orders.terms` | insert + `get_store_order*` |
| Merchant form for the rules | `/storefront` |
| Checkout shows only allowed fulfilment and payment methods, cash policy, total breakdown | `store.$slug.checkout` |
| Shared TS helpers for UI | `src/lib/storefront/order-rules.ts` |

## What it does not deliver

- Customer Paynow, EcoCash, InnBucks.
- Distance or zone pricing, geocoded eligibility.
- Enforced cut-off clocks or bookable collection slots.
- Email/SMS/WhatsApp send.
- Loyalty, coupons, reviews, customer accounts.

## Risks

| Risk | Mitigation |
|---|---|
| Migration not applied: Zod defaults keep old shops loading; new keys stay false | Apply SQL on staging; shop owners re-save to persist keys even before backfill; backfill is in the migration |
| Auto-accept confused with paid | Copy and events say payment is not recorded |
| Quote-required shops with old checkout clients | Server rejects priced delivery |
| exactCash vs changeProvided both true | SQL forces changeProvided false when exactCash |

## Acceptance criteria

1. A shop with only pickup and pay-on-pickup cannot submit pay-on-delivery.
2. A shop with `quoteRequired` cannot create a priced `delivery` order.
3. `autoAccept` confirmed orders remain `payment_status = unpaid` and `sale_id` null.
4. After changing flatFee, an existing order still shows the snapshotted fee in `terms` and stored `delivery_fee`.
5. Unpublished products remain absent from public RPCs (unchanged).
6. Unit tests cover allowed methods and exact-cash copy.

## Tests

- `npx vitest run tests/storefront.test.ts`
- `npx tsc --noEmit`
- After staging migrate: isolation suite with `SUPABASE_ACCESS_TOKEN`

## Rollback

The migration adds `store_orders.terms` (default `{}`) and replaces functions. Rollback is restore the previous function bodies from `20261019090000_storefront.sql` and leave the column (safe). Do not drop `terms` if orders exist.

## Next recommended slices (in order)

See `docs/ROADMAP_REMAINING.md` for the remaining ~190 items in batches.

1. Apply `20261019160000_store_reviews_and_reports.sql` on staging and smoke a review plus a listing report.
2. Merchant notification reliability (in-app first, then email when credentials exist).
3. Reconcile staging `locations` into git or revert it.
4. Customer Paynow only after a per-merchant integration, never with platform keys.
5. Branches and variants only after a single-stock model is explicitly replaced.

Retention features (loyalty, coupons, gift cards) wait until orders, stock, and payments stay trustworthy.
