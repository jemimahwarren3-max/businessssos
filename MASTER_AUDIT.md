# Kwetuu master-prompt audit (this repo)

Inspected: Vite 8 + React 19 + TanStack Start, Supabase staging `slajanbsfqjnuuiohbmg`, Cloud Run `kwetuu`, Paynow Node SDK. Not Next.js. Tenants are `businesses` + `storefronts` (`business_id`). Production Postgres was not touched.

## 1. Worth preserving

- Auth: email + Google PKCE (`/auth`, `/auth/callback`). Staff login by business name.
- Merchant OS: inventory, till/sales, invoices, quotes, customers, expenses, team, reports.
- Public shops: `{slug}.mykwetuu.com` (internal `/store/$slug`), cart, server-priced checkout, cash on pickup/delivery, quotes, order tracking.
- Existing **shop Paynow** (merchant’s own keys, webhook poll-before-credit) and **platform billing Paynow** (separate keys). Do not delete; do not mix with seller customer money.
- Ten layouts, one catalogue. Shop chrome is the shop, not the directory.
- RLS + `tests/integration/tenant-isolation.test.ts`.
- Notification outbox, receipts, legal drafts, cash drawer, fulfilment clocks.

## 2. Broken or incomplete

- Live Cloud Run image is older than this git stack.
- Staging GoTrue: **Email provider disabled** — email sign-up fails until the dashboard toggle is on.
- `{slug}.mykwetuu.com` needs wildcard DNS/TLS. Cloud Run cannot map `*`.
- Templates are layout variants, not ten cloned apps. Size/colour is description text, not SKU stock.
- Dashboard titles still say BusinessOS in places.
- Payment-proof **files** are not stored (no private bucket). Customers send a text reference; that never marks paid.
- Product image upload lives in a stacked PR, not necessarily this branch.

## 3. Missing vs this master prompt

| Prompt | Repo now |
| ------ | -------- |
| Manual payment methods | EcoCash / InnBucks / bank / other instructions + cash + optional Paynow |
| Proof statuses | `unpaid` / `pending` (note submitted) / `paid` (seller recorded) / `failed` (note rejected) / `refunded` |
| US$7 single plan | `PLAN_MONTHLY_USD.pro` is **$7**; beta `BILLING_ENABLED=false` |
| ZiG as a first-class currency | `CURRENCIES` includes ZWG; `formatMoney` shows `ZiG`. No invented FX rate |
| WhatsApp Business API | Not built (keep it that way). Click-to-chat + copy link exist. |
| Automated Paynow for shops | **Already implemented** — kept, not expanded in this phase |
| Image proof upload | Blocked: no private storage bucket |

## 4. Risks

- Mixing platform subscription Paynow keys with shop checkout (code already separates them; do not collapse).
- Fail-closed billing when `BILLING_ENABLED=true` and no subscription row.
- Do not apply storefront SQL to production without an explicit request.
- Migration `20261021120000_manual_shop_payments.sql` must be applied on staging before live checkout accepts `manual`.

## 5. Sequence (this prompt’s phases)

A. This audit. B. Public site + onboarding (in git). C. Storefronts + ten layouts (in git). D. Seller ops mostly exist. **E. Manual payment instructions (this increment).** F. $7 plan as config (this increment); do not charge until billing is on and Paynow subscription is verified. G. E2E still blocked on Email + wildcard DNS.

## 6. Needs your approval

- Turning on staging Email in Supabase.
- Wildcard DNS / TLS for `*.mykwetuu.com`.
- Applying any migration to **production** `maidxfntfpnkcqnuhozo`.
- Recurring $7 collection (provider must actually support it).
- Exchange-rate source for a ZiG subscription equivalent (none is wired; will not invent a rate).
- A private storage bucket if screenshot proof files are required.

Ordinary reversible work proceeded without waiting: manual payment instruction JSON, checkout copy, payment notes, $7 as the listed plan, ZiG as a store currency code.
