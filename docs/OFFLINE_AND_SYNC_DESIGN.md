# Offline and sync design

## Capability matrix

| Feature                                  | Offline                                                      |
| ---------------------------------------- | ------------------------------------------------------------ |
| POS product search (previously seen)     | Read-only from IndexedDB, stock is an **estimate** in the UI |
| In-progress POS cart                     | Snapshotted in IndexedDB `posDrafts` (survives refresh/power cut on this device) |
| Record cash/card-as-cash sale            | Available with delayed sync (`pendingSales`)                 |
| Failed sync (dead letter)                | Stays on the device; cashier can **Retry this sale** or Discard |
| Stock adjustments, invoices, expenses    | Requires internet                                            |
| Storefront checkout, Paynow, marketplace | Requires internet                                            |
| Auth, password reset, MFA                | Requires internet                                            |
| Reports, AI assistant, data export       | Requires internet                                            |
| Service worker app shell                 | Signed-in merchant JS/CSS only. Public shops need a network. |
| Product photos                           | Optional low-data deferral (`kwetuu-low-data`); logos/auth/MFA still load |

## Queue

`src/lib/offline/sync.ts` processes one sale at a time, in `createdAt` order. Each sale has `idempotencyKey`. Status: pending, syncing, failed. Oversell is detected from the server error text and flagged `isOverSold`. Closed-drawer failures stay queued with a cashier instruction. There is no automatic drop.

The sales page splits **These sales need you** (failed, with Retry this sale) from **Queued sales** (waiting). `syncOnePendingSale` retries one row without touching later ones. Auto-sync on reconnect still walks the whole queue, including previously failed rows (needed after the drawer is opened).

IndexedDB `businessos-offline` is **version 2**. v2 adds object store `posDrafts` only. `pendingSales` is not dropped or rebuilt on upgrade.

## Cart snapshot

The in-progress cart (items, customer, discount, payment split) is debounced into `posDrafts` keyed by `businessId`. Restore on POS mount shows: “Restored cart from before the power cut. Check it before charging.” Clear cart and a successful sale (online or queued) delete the draft. Logout drops drafts and the product cache; unsynced sales stay.

## Payments

Offline sales are not provider-confirmed. They are local drafts until `create_sale` succeeds. Do not retry Paynow from this queue.

## Conflicts

Server stock is source of truth. Local decrement is optimistic. Two devices can still oversell; the second sync fails and stays on the device. Offline search labels stock as an estimate.

## Logout

Product snapshots and the in-progress cart for the current business are removed. Unsynced sales are kept.

## Low-data

Account setting `auto` | `on` | `off` in localStorage `kwetuu-low-data`. `auto` follows `navigator.connection.saveData`. Product photos (inventory, shop catalogue, market, listing photos) wait for a tap. Public-shop HTML may still include image URLs before hydrate.

## Tests run

Unit tests in `tests/offline-sync.test.ts` and `tests/offline-income.test.ts`. Not tested here: airplane mode, quota exhaustion, private browsing, SW update with a full queue, a real power cut on a till.
