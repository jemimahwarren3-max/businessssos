# Kwetuu product integration audit

**Date:** 26 October 2026 (Africa/Harare)  
**Scope:** Why the owner dashboard feels like “business tools only”, what is actually built, and what is still partial or missing.  
**Method:** Repository inspection (routes, RPCs, migrations, docs). Live `mykwetuu.com` deploy revision was **not** verified in this run — compare production commit to `master` after merges.

**Legend**

| Status | Meaning |
| ------ | ------- |
| **Built and connected** | End-to-end workflow exists and is reachable in the app. |
| **Built partially** | Code/DB exists; workflow, UX, or integration incomplete. |
| **Built but hidden** | Works via URL or deep screen; poor nav/discoverability. |
| **Not built** | No trustworthy implementation. |
| **Ops / unverified** | Depends on env, provider approval, or staging/prod config. |

---

## Executive summary

Kwetuu **does** include a public storefront, checkout, shopper accounts, online orders, templates, and payment safety — but the **owner app** was organized like generic business software (invoices first, storefront as one sidebar line). That made the ecommerce story feel missing even when code exists.

**This branch adds:** grouped navigation (“Online shop”), **My Online Store** with launch status badge, a **store launch centre** (7-step checklist with jump links), **Online orders** nav entry, and dashboard prominence — without removing working POS/inventory tools.

**Still not product-complete vs your spec:** separate launch-fee product, full multi-branch UX, dedicated courier API, SMS/WhatsApp order alerts, standalone `/orders` fulfilment desk, and production deploy parity.

---

## Feature matrix (high level)

| Area | Status | Frontend | Backend / DB | Notes |
| ---- | ------ | -------- | -------------- | ----- |
| Business dashboard | Built and connected | `/dashboard` | `getDashboard`, sales RPCs | Launch centre card added on dashboard. |
| POS / sales | Built and connected | `/sales` | `create_sale`, offline queue | Operate gated when billing on (#64 + RPC migration #69). |
| Inventory | Built and connected | `/inventory` | `products`, locations stock | Variants not built. |
| Invoices / quotes | Built and connected | `/invoices`, `/quotes` | Invoice RPCs | Separate from shop checkout. |
| **My Online Store (owner)** | Built partially → **improving** | `/storefront` | `get_storefront_admin`, `save_storefront`, `set_storefront_published` | Was labeled “Storefront”; launch centre + status in this PR. |
| Store templates (60) | Built and connected | Design section | Template IDs in save payload | Must save draft + publish. |
| Customer public shop | Built and connected | `/store/$slug`, subdomains | `get_public_store`, orders RPCs | Needs wildcard DNS on prod. |
| Guest + account checkout | Built partially | checkout routes | `create_store_order`, shopper auth | Distinct from owner auth; see shopper tests. |
| **Online orders (owner)** | Built but hidden → **nav fix** | Was only on storefront page | `transition_order`, admin order RPC | New `/online-orders` → `#online-orders`. |
| Seller Paynow | Built partially | Paynow section | Encrypted credentials; gate `shop_offers_paynow` | Automated checkout **disabled** pending provider approval. |
| Manual / cash shop payments | Built and connected | checkout + merchant confirm | Payment safety migrations | Proof ≠ paid. |
| Kwetuu subscription billing | Built partially | `/settings/billing` | Paynow platform keys, USD (+ ZiG in PR #68) | `BILLING_ENABLED` + `platform_runtime` ops. |
| **Launch fee (separate)** | Not built | — | — | Subscription only today. |
| Order state machine | Built partially | Order detail on storefront | `transition_order`, fulfilment statuses | No standalone Orders app section. |
| Branches / locations | Built partially | Limited UI | `locations`, per-location stock, POS `location_id` | Not full “Harare / Bulawayo” branch product UX. |
| Notifications | Built partially | `/notifications`, bell | Outbox + Resend | Email ops; no SMS/WhatsApp/courier API. |
| Courier integrations | Not built | — | — | Manual dispatch only. |
| Customer marketplace | Built partially | `/market`, `/stores` | Marketplace RPCs | Discovery, not Amazon-scale search. |
| Windows / Android shells | Built partially | PR #66 scaffold | Hosted URL v1 | Not store-native parity. |

---

## Route map (owner app)

| Nav group | Route | Purpose |
| --------- | ----- | ------- |
| Overview | `/dashboard` | KPIs + **store launch centre** (compact) |
| Business | `/sales`, `/inventory`, … | Offline-first business tools (optional without online shop) |
| **Online shop** | `/storefront` | **My Online Store** — launch centre, design, publish |
| **Online shop** | `/online-orders` | Redirect to order list on storefront |
| Growth & AI | `/growth`, `/insights`, `/assistant` | Marketing + AI (usage limits in PR #68) |
| Settings (footer) | `/settings/billing` | **Kwetuu** subscription (not customer money) |
| Settings | `/settings/team`, `/cash-drawer`, … | Staff, till, export |

Public (customer): `/store/{slug}`, `/store/{slug}/checkout`, `/store/{slug}/account`, marketplace `/market`.

---

## Two business modes (product intent)

| Mode | Supported today | Gap |
| ---- | ----------------- | --- |
| **Business only** | Yes — POS, inventory, invoices without publishing | Nav now states online shop is optional. |
| **Business + online** | Yes — publish storefront, checkout, orders | Launch fee as separate SKU not implemented; Paynow seller automation gated. |

---

## Payment separation (required)

| Flow | Keys / table | Who pays whom |
| ---- | ------------- | -------------- |
| Kwetuu Pro subscription | `PAYNOW_INTEGRATION_*` (USD/ZiG) | Owner → Kwetuu |
| Shop customer checkout | Seller `store_paynow_credentials` or manual | Customer → seller |

Never mark shop orders paid from redirect alone — poll/confirm or seller verification (implemented in payment safety work).

---

## Deployment checklist (operator)

1. Confirm Cloud Run revision matches intended Git `master` (or release branch).  
2. `BILLING_ENABLED`, Paynow keys, `APP_URL`, wildcard DNS.  
3. Apply migrations including `platform_runtime.billing_enforced` when enforcing paid operate (#69).  
4. Resend + `NOTIFY_FROM_EMAIL` for order emails.  
5. Run `npm run verify:staging` with `SUPABASE_ACCESS_TOKEN`.

---

## Prioritized build queue (after stack merge)

1. ~~**Merge** launch centre + billing RPC + Paynow ZiG + theme/tooltips~~ → `cursor/kwetuu-stack-merge-dafe`.  
2. ~~**Dedicated orders desk**~~ → `/online-orders` + `/orders` alias + shared fulfilment panel.  
3. **Launch fee** — documented on `/settings/payments` as subscription-only until product adds a SKU.  
4. **Branch management UI** — read-only `/branches` list; create/edit locations still operator-led.  
5. ~~**Launch step 6**~~ → wired to `get_notify_email` (email alerts on).  
6. **E2E** — extra public smoke; owner publish + guest checkout still needs staging credentials.

---

## Files touched (launch centre PR)

- `src/lib/storefront/launch-status.ts` — status + checklist steps  
- `src/components/storefront/store-launch-centre.tsx` — UI  
- `src/components/app-shell.tsx` — grouped nav + badge  
- `src/routes/_authenticated/storefront.tsx` — launch centre, anchors, title  
- `src/routes/_authenticated/online-orders.tsx` — discoverability route  
- `src/routes/_authenticated/dashboard.tsx` — compact launch centre  
- `tests/store-launch-status.test.ts`
