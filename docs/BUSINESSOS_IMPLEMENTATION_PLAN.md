# BusinessOS implementation plan

## Goal of this increment

Shoppers can create an account, see orders they placed while signed in, claim a guest order with the access code, and store per-shop message consent. Guest checkout and access-code tracking stay intact. Email matching does not steal orders.

This is the customer-accounts slice from `ROADMAP_REMAINING.md`.

## Why not the rest of the 200

Variants still need stock rows that the POS actually uses. Customer Paynow needs merchant credentials. Shopper email send would be a lie until a mail path exists.

## Dependencies

1. Storefront, order rules, fulfilment clocks, and cash drawer migrations already on this stack.
2. **This slice:** `20261019210000_shopper_accounts.sql`. Apply on staging `slajanbsfqjnuuiohbmg` only. Not applied to production.

## What this slice delivers

| Behaviour                                          | Where                                                     |
| -------------------------------------------------- | --------------------------------------------------------- |
| `store_orders.shopper_user_id`                     | set from `auth.uid()` at checkout                         |
| Claim guest order with access code                 | `claim_store_order`                                       |
| Order history for the signed-in user at one shop   | `get_shopper_account`                                     |
| Per-shop message consent                           | `shopper_shop_consents`                                   |
| Guest token still opens `get_store_order`          | `storefront_can_access_order`                             |
| Shop account UI and host `/account` rewrite        | `store.$slug.account`, `host.ts`                          |
| Checkout attaches the session and optional consent | `placeOrder` uses the authed client when a session exists |

## What it does not deliver

- Automatic attach by email.
- Shopper marketing or order-status email.
- Customer Paynow.
- A shared cart across shops.

## Risks

| Risk                                  | Mitigation                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------- |
| Session on shop host vs merchant apex | Same cookie name, host-scoped. Shop subdomain does not share merchant SSO. |
| Claiming someone else's order         | Token required; already-claimed orders refuse.                             |
| Reviews without a token               | Signed-in owner of `shopper_user_id` is enough. Guests still use the code. |

## Acceptance criteria

1. Guest `create_store_order` leaves `shopper_user_id` null.
2. `asUser` checkout sets `shopper_user_id`.
3. History does not include another shopper's orders.
4. Access code still loads a claimed order.
5. Email on a guest order does not attach it to a later account unless claimed.

## Tests

- `npx vitest run tests/shopper-accounts.test.ts tests/storefront.test.ts`
- `npx tsc --noEmit`
- After staging migrate: `tests/integration/shopper-accounts.test.ts` and isolation

## Rollback

Drop the new RPCs, leave `shopper_user_id` and `shopper_shop_consents` (nullable / unused). Restore previous `create_store_order` / `get_store_order` bodies from `20261019190000_storefront_fulfilment_clocks.sql`.

## Next recommended slices

1. Apply this migration on staging.
2. Variants wait until location stock is used in the app UI.
3. Customer Paynow only with per-merchant credentials.
