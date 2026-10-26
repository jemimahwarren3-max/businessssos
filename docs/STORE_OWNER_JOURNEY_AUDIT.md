# Store owner journey audit (Phase 1)

**Date:** 26 October 2026  
**Scope:** Signup → setup → payment → publish → daily ops (including offline).  
**Goal:** Explain why unpaid users could use paid features, and what is already built vs missing.

## Executive summary

Kwetuu already implements much of the Shopify-style journey (auth, onboarding, storefront builder, marketplace, POS, offline sales queue, Paynow subscription billing). The main **unpaid usage** problem is not missing UI — it is **enforcement configuration and tiering**:

1. **`BILLING_ENABLED=false`** (historically set on Cloud Run deploy) turns off **all** server-side write gates while leaving subscription rows in place.
2. Even with billing on, **`trialing` was treated like paid** for every write, including **publish** and **POS**, which contradicts marketing (“free until you publish”).
3. **Postgres RPCs** (e.g. `create_sale`, `set_storefront_published`) do not re-check subscription; a client calling Supabase directly could bypass Node `assertCanWrite` unless RLS/RPC checks are added (still open).

**Phase 1 fix in this branch:** split **setup** writes (trial OK) from **operate** writes (publish, POS, cash drawer — **`active` subscription only** when billing is on).

---

## Lifecycle vs codebase

| Stage | Spec | Current implementation |
| ----- | ---- | ---------------------- |
| 1 Account | Email/Google, verify, workspace | `auth.*`, `create_business_with_owner`, onboarding routes |
| 2 Setup (draft) | Wizard, templates, draft products | `onboarding.tsx`, `storefront.tsx`, templates, product CRUD with `assertCanWrite` |
| 3 Pay & activate | Launch fee + subscription | **Subscription only** — Pro trial 3 days, then Paynow → `active`. **No separate launch-fee table.** |
| 4 Publish | Paid + checklist | RPC `set_storefront_published` (setup checklist only) + **`assertCanPublish`** (paid) |
| 5 Daily ops | POS, inventory, offline | POS + offline queue exist; operate gate on sales/cash |

---

## Why users could use the system without paying

| Cause | Evidence |
| ----- | -------- |
| Billing master switch off | `isBillingEnabled()` → false when `BILLING_ENABLED=false`; `canWriteForSubscription` returns true for everyone (`src/lib/feature-flags.server.ts`, `billing-write.ts`). Deploy workflow previously hardcoded `false`; **confirm production env** in GCP/Render (`.env.example` defaults `"true"`). |
| Trial = full product | Until this fix, `assertCanWrite` allowed **trialing** for publish and `create_sale`. |
| Published shops stay live | No job to unpublish when subscription lapses; public RPCs only check `storefronts.status = 'published'`. |
| UI not authoritative | `isReadOnly` banner only; many buttons not disabled. Server must enforce (partially does via server functions). |
| Direct RPC bypass | Authenticated role can execute grants on many RPCs without Node layer — **high residual risk**. |

---

## Payments (trusted server)

| Piece | Location | Notes |
| ----- | -------- | ----- |
| Subscription checkout | `paynow.server.ts`, `paynow_confirm_payment` | Poll + hash verify; idempotent confirm |
| USD plan | `billing-plans.ts` | Single Pro plan (display $7/mo) |
| ZiG display | `platform_fx` + marketing | Paynow charges USD |
| Launch fee | — | **Not implemented**; first Pro payment acts as “go live” |
| Grace period | Legal copy only | `past_due` / period end not fully enforced in `canWriteForSubscription` |

---

## Store publication

- **Server:** `publishStorefront` → `set_storefront_published` (products, fulfilment, payment methods).
- **Payment gate:** `assertCanPublish` → requires **`active`** when billing on (this branch).
- **Unpublish:** Permission only (no paid gate) so expired merchants can take the shop offline.

---

## Offline POS (already present)

| Component | Path |
| --------- | ---- |
| PWA shell | `vite.config.ts` VitePWA, `_authenticated/route.tsx` registers SW |
| IndexedDB | `src/lib/offline/db.ts` — products + `pendingSales` |
| Sync | `src/lib/offline/sync.ts` → `createSale` with UUID idempotency |
| UI | `sales.tsx` — offline banner, queue, sync on reconnect |
| Server idempotency | `create_sale` + unique `(business_id, idempotency_key)` |

**Gaps vs spec:** no signed offline entitlement TTL; no background sync when tab closed; inventory adjustments not queued; `BILLING_ENABLED=false` allowed offline sync to paid RPCs without operate gate (now gated on `createSale`).

---

## Recommended build order (matches your three passes)

### Pass 1 — Payment enforcement (this PR)

- [x] Tier setup (`trialing`) vs operate (`active`) in `billing-write.ts`
- [x] `assertCanOperate` / `assertCanPublish` on publish, sales, cash drawer
- [x] Workspace `isOperateLocked` + dashboard banner
- [ ] Operator: set **`BILLING_ENABLED=true`** on production Cloud Run / host
- [ ] Configure **`PAYNOW_*`** for live subscription checkout
- [ ] Postgres: optional `assert_business_can_operate()` inside critical RPCs

### Pass 2 — Launch journey

- [ ] Explicit launch checklist UI tied to DB (partially in storefront checklist)
- [ ] Optional **`store_launch_payments`** table if launch fee must be separate from first month
- [ ] Auto-unpublish or checkout banner when subscription expires
- [ ] Enforce `current_period_end` / `past_due` in subscription helpers

### Pass 3 — Offline entitlement + sync hardening

- [ ] Server-issued signed offline entitlement (expiry)
- [ ] Block new offline sales when entitlement expired; preserve queue
- [ ] Stock conflict UI; advisory lock on POS idempotency (see `STOREFRONT_AUDIT.md`)

---

## Manual verification checklist

1. New business on **billing on**: add products (OK during trial), **Publish** and **Sales** blocked until Paynow → `active`.
2. **`BILLING_ENABLED=false`**: all writes allowed (beta mode).
3. Paynow test payment → subscription `active` → publish succeeds.
4. Offline sale queues → sync after pay → single `create_sale` row (retry same idempotency key).
5. Attempt `set_storefront_published` via Supabase client as trialing user (document if still succeeds — RPC gap).

---

## Files changed (Phase 1 enforcement)

- `src/lib/billing-write.ts` — `canOperateForSubscription`
- `src/lib/business.server.ts` — `assertCanOperate`, `assertCanPublish`, workspace flag
- `src/lib/storefront/storefront.server.ts` — publish gate
- `src/lib/cash-drawer.server.ts` — operate gate
- `src/components/app-shell.tsx` — setup vs operate banner
- Authenticated routes — pass `isOperateLocked` into `AppShell`
