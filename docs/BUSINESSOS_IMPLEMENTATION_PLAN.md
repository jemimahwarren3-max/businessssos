# BusinessOS implementation plan

## Goal of this increment

Give shoppers and merchants the same receipt (what, when, how), and let each shop link **its own** Paynow account for EcoCash/card checkout.

## What this slice delivers

| Behaviour                                        | Where                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| Shared printable receipt                         | `OrderReceipt` on customer order, account history, merchant orders |
| Shopper history with items, when, how            | `get_shopper_account` + account page                               |
| Merchant order list is the same history          | Storefront “Online orders” + shared receipt                        |
| Merchant Paynow keys sealed with SESSION_SECRET  | `store_paynow_credentials`                                         |
| Shopper Paynow never uses `PAYNOW_INTEGRATION_*` | `shop-paynow.server.ts`                                            |
| Webhook routes shop refs vs subscription refs    | `src/server.ts`                                                    |

## What it does not deliver

- InnBucks, Stripe, or other processors.
- Automatic Paynow refunds.
- Production SQL.

## Tests

- `npx vitest run tests/storefront.test.ts tests/receipt-paynow.test.ts`
- `npx tsc --noEmit`
