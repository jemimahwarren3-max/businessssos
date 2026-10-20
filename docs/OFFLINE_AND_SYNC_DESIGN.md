# Offline and sync design

## Capability matrix

| Feature                                  | Offline                                                      |
| ---------------------------------------- | ------------------------------------------------------------ |
| POS product search (previously seen)     | Read-only from IndexedDB, stock is an estimate               |
| Record cash/card-as-cash sale            | Available with delayed sync (`pendingSales`)                 |
| Stock adjustments, invoices, expenses    | Requires internet                                            |
| Storefront checkout, Paynow, marketplace | Requires internet                                            |
| Auth, password reset, MFA                | Requires internet                                            |
| Reports, AI assistant, data export       | Requires internet                                            |
| Service worker app shell                 | Signed-in merchant JS/CSS only. Public shops need a network. |

## Queue

`src/lib/offline/sync.ts` processes one sale at a time, in `createdAt` order. Each sale has `idempotencyKey`. Status: pending, syncing, failed. Oversell is detected from the server error text and flagged `isOverSold`. There is no automatic drop. There is no dead-letter UI beyond the sales page queue.

## Payments

Offline sales are not provider-confirmed. They are local drafts until `create_sale` succeeds. Do not retry Paynow from this queue.

## Conflicts

Server stock is source of truth. Local decrement is optimistic. Two devices can still oversell; the second sync fails and stays on the device.

## Logout

Product snapshots for the current business are removed. Unsynced sales are kept.

## Tests run

Unit tests in `tests/offline-sync.test.ts`. Not tested here: airplane mode, quota exhaustion, private browsing, SW update with a full queue.
