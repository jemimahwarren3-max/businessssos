# Kwetuu System Audit — Stage 1 Discovery

**Date:** 3 November 2026 (Africa/Harare)  
**Head:** `2606441` (origin/master after PR #115)  
**Branch that produced this report:** `cursor/system-debug-audit-dafe`  
**Method:** Repository inspection of routes, server functions, migrations, RLS, CI/deploy workflows, and existing unit tests. GitHub Actions history for `master` was reviewed.  
**Not done this pass:** Live browser walkthrough of every merchant/shopper flow; EcoCash/Paynow money movement; WhatsApp Cloud send; production SQL apply; destructive testing.

This report **replaces** the 3 November onboarding-journey draft that marked almost every module WORKING and listed zero P0/P1 issues. That draft described intended architecture, not verified workflows. A feature is only WORKING here when the frontend, validation, database, permissions, and resulting state are all present in code **and** the remaining gap is configuration — not missing logic.

**No application code was changed during discovery.**

---

## 1. Overall application status

Kwetuu is a **real, multi-tenant commerce product**, not a visual prototype. Core money paths (POS `create_sale`, shop `quote_store_cart` / `create_store_order`, subscription Paynow poll) are implemented as atomic Postgres RPCs with idempotency, membership checks, and server-side prices. Auth uses an httpOnly encrypted session, not `localStorage` JWTs.

It is **not yet a stable, fully verified system**.

Recent production pain (shop load hang, “We couldn’t load your shop”, Create-shop RPC mismatches, cancelled master deploys) came from **schema and CI drift**, not from missing pages. The previous audit’s “good shape / no P0” conclusion is incorrect.

| Verdict | Detail |
| ------- | ------ |
| Architecture | Sound. Keep Vite + React + TanStack Start + Supabase. Do not rebuild. |
| Critical money RPCs | Present and carefully written. Staging integration tests exist; they skip unless `SUPABASE_ACCESS_TOKEN` is set. |
| Production vs git | **Unverified and structurally uncoupled.** Staging SQL is applied in CI. Production SQL is operator-only. Cloud Run can ship new Node against an older `maidxfntfpnkcqnuhozo` schema. |
| Live master CI | PR #115 (`2606441`) **succeeded** at 04:47 CAT on 3 Nov 2026. PR #116’s master CI **failed**. PR #114’s master CI was **cancelled** by repo-wide `cancel-in-progress`. The mail-flush workflow is **failing**. |
| Security | Service-role key is server-only. RLS is enabled on tenant tables. One new SECURITY DEFINER RPC (`get_setup_progress`) is granted to every authenticated user **without** a membership check. |
| Completeness | Many screens are wired. Several Zimbabwe-shaped behaviours (variants, branch transfers, custom domains, provider-verified POS EcoCash, WhatsApp Cloud send) are missing or configuration-blocked. |

**Honest one-line status:** Capable core, operationally fragile, one confirmed cross-tenant read RPC, several incomplete product surfaces.

---

## 2. Architecture overview

| Layer | Technology | Evidence | Status |
| ----- | ---------- | -------- | ------ |
| Frontend | React 19, TanStack Router/Start, Vite 8, Tailwind v4, Radix | `package.json`, `src/routes/` (41 route files) | Sound |
| Merchant API | TanStack Start server functions + Zod `parseAndSanitize` | `src/lib/business.functions.ts` (~143 handlers) | Sound |
| Database | Supabase Postgres — staging `slajanbsfqjnuuiohbmg`, production `maidxfntfpnkcqnuhozo` | `scripts/staging-manifest.mjs`, `CONTRIBUTING.md` | Staging applied in CI; production **not** |
| Auth | Supabase Auth + AES httpOnly `businessos_session` + PKCE | `src/lib/auth/session.server.ts`, `src/integrations/supabase/client.ts` | Sound |
| Authorization | `business_members` + `has_permission` / `get_my_permissions` + RLS | Foundation migration + `assertPermission` | Partial — some reads skip the permission key |
| Rate limit | `rate_limit_hits` + `check_rate_limit` | `src/lib/rate-limit.server.ts` | Authed paths fail-open on RPC error (intentional after #115) |
| Payments | Paynow SDK (subscription, shop, launch fee) + manual shop proofs | `src/lib/payments/*.server.ts` | Code present; live rails **unverified** |
| Email | Resend + `notification_outbox` | `src/lib/notifications.mail.server.ts` | Code present; flush cron **broken** |
| WhatsApp | Graph Cloud outbox **or** `wa.me` prefill | `src/lib/notifications.whatsapp.server.ts` | No fake “sent”; delivery **unverified** |
| Cache | Upstash Redis (workspace 60s) | `src/lib/business.server.ts` | Optional; skip-safe |
| Deploy | Cloud Run from `master` after CI `check` | `.github/workflows/ci.yml` | Manual `workflow_dispatch` can skip CI |
| Mobile / desktop | Capacitor Android, Tauri | `package.json` scripts | Exists, **unverified** |
| Tests | 67 unit files, 18 staging integration files, 2 Playwright smokes | `tests/`, `e2e/` | Unit always; integration and e2e do not gate deploy |

### Frontend modules

Public marketing (`/`, `/stores`, `/market`, `/templates`, `/pricing`, `/faq`, `/auth`, legal). Authenticated ERP (`/dashboard`, `/setup`, `/onboarding`, POS, inventory, customers, invoices, quotes, expenses, reports, cash drawer, lay-by, team, billing, storefront builder). Public shops (`/store/$slug/**`). Platform admin (`/admin/**`).

### Backend functionality

Session-scoped server functions for merchant writes. Anon RPCs for public catalogue/quote/order. Admin client (`supabaseAdmin`) only in allowlisted `*.server.ts` files plus dynamic import from mail/WhatsApp flush.

### Database entities (high level)

`businesses`, `business_members`, `business_settings`, `subscriptions`, `products`, `product_stock`, `categories`, `customers`, `sales`, `sale_items`, `payments`, `expenses`, `invoices`, `quotes`, `purchase_orders`, `cash_sessions`, `inventory_movements`, `storefronts`, `product_listings`, `store_orders`, `shop_order_payments`, `notification_outbox`, `notifications`, `rate_limit_hits`, `platform_*`, lay-by / deposit tables from notebook-delivery. ~91 migration files; 36-entry staging manifest.

### Important business workflows

1. Sign up / OAuth → session cookie → `destinationAfterAuth` → `/onboarding` or `/dashboard` → `/setup` if `setup_completed_at` is null.  
2. Create shop → `create_business_with_owner` (7-arg jsonb) → first membership wins forever.  
3. POS → `addSale` → `create_sale` (10-arg, split tenders) → stock + payments in one transaction.  
4. Publish shop → eligibility RPC → public `/store/{slug}` or `{slug}.host`.  
5. Checkout → `quote_store_cart` → `create_store_order` (unpaid) → Paynow poll **or** manual proof + seller confirm.  
6. Platform billing → Paynow poll + hash; `BILLING_ENABLED` is **false** in Cloud Run today.

---

## 3. Module-by-module audit

Status key: **WORKING** (complete in code, remaining risk is config) · **PARTIALLY WORKING** (real logic, incomplete workflow or unsafe edge) · **BROKEN** (exists and fails, or ops path proven failing) · **MISSING** (no implementation) · **UNVERIFIED** (cannot establish without live credentials / browser).

### A. Public landing page — WORKING (code)

| Check | Status | Notes |
| ----- | ------ | ----- |
| Logo, Browse stores, Store designs, Pricing, FAQ | WORKING | `src/lib/marketing-nav.ts`, `MarketingShell` |
| Sign in + Start a store | WORKING | Added in PR #115; desktop + mobile |
| Marketplace vs create vs account | WORKING | Hero copy distinguishes the three |
| Live social proof | WORKING | Landing fetches published shops, not mock businesses |
| Responsiveness / refresh / direct URLs | UNVERIFIED | Routes exist; no device pass this session |
| External links | UNVERIFIED | |

### B. Authentication — PARTIALLY WORKING

| Check | Status | Notes |
| ----- | ------ | ----- |
| Email sign-up / sign-in / session cookie | WORKING | Server `signIn` + `establishSessionFromAuthTokens` |
| Google OAuth | PARTIALLY WORKING | PKCE works; `next` query is **ignored** after callback (`AUTH-1` / KW-010) |
| Password reset | PARTIALLY WORKING | Request + `/reset-password` exist; MFA aal1 may block `updatePassword` (KW-011) |
| Logout / protected routes | WORKING | `_authenticated` layout; SSR off to avoid OAuth loops |
| Staff login | PARTIALLY WORKING | Always navigates to `/dashboard`; skips `resolvePostAuthPathForUser` |
| MFA TOTP | PARTIALLY WORKING | Enforced at layout when enrolled |
| Unverified / lockout / rate limits | WORKING | IP fail-closed; login lockout; peek fail-open |
| Session restore vs route guard | WORKING | `getCurrentUser` is session-only; dashboard does **not** bounce to onboarding on load error (PR #115) |
| Shopper vs merchant same session | PARTIALLY WORKING | Same cookie; storefront sign-in does not isolate merchants |
| Live email confirmation / expired links | UNVERIFIED | Depends on GoTrue SMTP |

### C. Profiles and business membership — PARTIALLY WORKING

| Check | Status | Notes |
| ----- | ------ | ----- |
| Membership scoped by `user_id` | WORKING | `loadWorkspace` uses `auth` user, not “first row in businesses” |
| First membership only | WORKING (as coded) | `.order(created_at).limit(1)` — **no switcher** |
| Second business | BLOCKED | `create_business_with_owner` returns existing id; `accept_business_invite` rejects a second shop |
| Staff invites | WORKING | Token accept RPC |
| Impersonation | WORKING | Platform admin; missing RPC is skipped |
| Permissions load | PARTIALLY WORKING | `get_my_permissions` errors are swallowed → empty array (KW-012) |

### D. Business onboarding — PARTIALLY WORKING

| Check | Status | Notes |
| ----- | ------ | ----- |
| Guided create (name, type, path, operations, store, review) | WORKING | `onboarding.tsx`; management path skips store step |
| Persist / resume wizard | PARTIALLY WORKING | Server `onboarding_config`; localStorage shop-step helpers are **unused** |
| Existing shop not recreated | WORKING | Redirect to `/setup` or `/dashboard` |
| `/setup` checklist | PARTIALLY WORKING | Live counts via `get_setup_progress` (see KW-001); **no error UI** if RPC fails |
| Dual completion flags | PARTIALLY WORKING | Create sets `onboarding_completed = true`; `setup_completed_at` stays null until skip/complete. Post-auth uses the first flag; dashboard uses the second (KW-013) |
| Hang / retry | WORKING | 8s timeout + workspace-error UI (PR #114/#115) |
| Live create against production schema | UNVERIFIED | Staging manifest always re-applies journey SQL; production does not |

### E. Products and catalogue — PARTIALLY WORKING

| Check | Status | Notes |
| ----- | ------ | ----- |
| CRUD, images, categories, search | WORKING | Storage `product-media`; CSV import gated |
| Shared POS + online catalogue | WORKING | Listings wrap products |
| Channel visibility | WORKING | POS / online flags |
| Variants | MISSING | Documented in `KNOWN_LIMITATIONS.md` |
| Historical price integrity | WORKING | `create_sale` uses catalogue `selling_price`; client `unitPrice` ignored |
| Wholesale second price | PARTIALLY WORKING | Column exists; POS/shop still sell at `selling_price` |

### F. Inventory — PARTIALLY WORKING

| Check | Status | Notes |
| ----- | ------ | ----- |
| `adjust_stock` + movements | WORKING | `FOR UPDATE` / `apply_stock_delta` |
| Sale deduction | WORKING | Inside `create_sale` |
| Locations | PARTIALLY WORKING | Schema exists; POS and inventory UI default location |
| Transfers | MISSING | Migration comment: not implemented |
| Negative stock toggle | UNVERIFIED | DB setting, no merchant UI |
| Concurrent same-SKU sales | WORKING | Row locks |
| Offline stock | PARTIALLY WORKING | Device estimate; labelled |

### G. Point of Sale — WORKING (with caveats)

| Check | Status | Notes |
| ----- | ------ | ----- |
| Cart → totals → `create_sale` → receipt → history | WORKING | `sales.tsx` + 10-arg RPC |
| Split tenders | WORKING | Stage 2 SQL; sum must equal total |
| Idempotency | PARTIALLY WORKING | Unique index + early return; **no advisory lock** (race → unique violation, not a second sale) |
| Stock in same transaction | WORKING | Failed sale does not commit deduction |
| Offline queue | WORKING | IndexedDB + sequential replay; same idempotency key |
| Cash drawer | WORKING | Cash sales require open session |
| POS EcoCash / InnBucks | PARTIALLY WORKING | Recorded as completed tenders — **cashier attestation**, not provider verify |
| Location on sale | PARTIALLY WORKING | `_location_id` omitted by Node |
| Live POS on production | UNVERIFIED | |

### H. Online storefronts — PARTIALLY WORKING

| Check | Status | Notes |
| ----- | ------ | ----- |
| Builder, templates, branding | WORKING | 60 templates; allowlist SQL |
| Publish gates | WORKING | Listings, fulfilment, payment methods, launch fee, not suspended |
| Public URL `/store/{slug}` | WORKING | Unpublished → Shop-not-live page, not a bare 404 |
| Preview `?preview=1` | PARTIALLY WORKING | Auth + member; errors redirect to `/onboarding` (KW-018) |
| Subdomain `{slug}.host` | PARTIALLY WORKING | App rewrite exists; Cloud Run maps apex only; wildcard DNS/TLS is ops |
| Custom domains | MISSING | |
| Correct seller catalogue | WORKING | `get_public_store` filters published + not suspended |

### I. Orders and checkout — WORKING (code)

| Check | Status | Notes |
| ----- | ------ | ----- |
| Server quote / ignore client prices | WORKING | `quote_store_cart` |
| Guest + shopper checkout | WORKING | Access code; `shopper_user_id` when signed in |
| Order starts `unpaid` | WORKING | Method select does **not** mark paid |
| Reserve stock (except quote) | WORKING | |
| Manual proof → pending | WORKING | Seller `record_store_order_payment` |
| Paynow shop | PARTIALLY WORKING | Isolated credentials; often disabled by provider controls |
| Merchant fulfilment | WORKING | `transition_store_order` |
| Live Paynow | UNVERIFIED | |

### J. Payments and subscriptions — PARTIALLY WORKING

| Check | Status | Notes |
| ----- | ------ | ----- |
| Platform vs shop vs launch fee | WORKING | Separate clients and tables |
| Success URL not trusted | WORKING | Poll + SHA512 + amount/reference match |
| Webhook | WORKING | Hash + re-poll; IP rate-limit fail-closed |
| `BILLING_ENABLED` | PARTIALLY WORKING | **Hard-coded false** in Cloud Run deploy — subscriptions will not enforce |
| SQL `billing_enforced` | PARTIALLY WORKING | Must be set independently of the Node flag |
| Trial vs POS | PARTIALLY WORKING | When billing is on, trial **cannot** operate POS (`canOperateForSubscription`) |
| Admin exemption | WORKING | Feature flags / platform bypass |
| Live Paynow charges | UNVERIFIED | Do not test on production data |

### K. Customers and CRM — WORKING (code)

Isolated by `business_id` + RLS. Search, soft delete, credit repayment RPC, deposits/lay-by tables + UI. Live UX **unverified**.

### L. Expenses and reporting — PARTIALLY WORKING

Server-side totals; revenue ≠ profit; no USD+ZiG blend. Payment mix on Reports is by **method**, not tender rail/currency (dashboard takings are better). **`getReports` and `listExpenses` do not `assertPermission`** — any member can read via RLS (KW-014).

### M. Staff, branches, permissions — PARTIALLY WORKING

57+ permission keys; role matrix editable by owner; cashier defaults exclude `reports.financial`. Writes generally go through `assertPermission` + RPC `has_permission`. Reads (reports, expenses, dashboard) rely on “members can SELECT”. Branch UI exists; stock transfers **missing**. Multi-business switch **missing**. Cashier-as-owner has not been live-tested this pass.

### N. Notifications and WhatsApp — PARTIALLY WORKING / BROKEN (ops)

| Channel | Status | Notes |
| ------- | ------ | ----- |
| In-app | WORKING | Inserts on proofs/orders |
| Email outbox | PARTIALLY WORKING | Real Resend send when configured; stays pending otherwise |
| WhatsApp Cloud | PARTIALLY WORKING | Cannot mark sent without Meta message id — correct |
| `wa.me` buttons | WORKING | Merchant must tap Send |
| Flush cron | **BROKEN** | `.github/workflows/flush-mail.yml` expects `{sent,failed,configured}`; API returns `{email,whatsapp}` — GitHub runs are **failing** (KW-005) |

---

## 4. Security findings

| Finding | Severity | Detail |
| ------- | -------- | ------ |
| `get_setup_progress` has no `auth.uid()` membership check | **P0** | SECURITY DEFINER, `GRANT` to `authenticated`. Any logged-in user (including a shopper) who knows a business UUID can read product/sale counts and `onboarding_config`. Sister RPCs (`mark_setup_complete`, `save_onboarding_*`) **do** check owner. |
| Service-role key in frontend | None found | Browser client uses publishable key only. ESLint blocks static admin imports. Mail/WhatsApp use **dynamic** import (not on the allowlist). |
| Tenant RLS | Generally sound | Foundation loop + later explicit enables. Isolation suite exists (`tests/integration/tenant-isolation.test.ts`) — staging-only. |
| Financial read permissions | P1 | Cashier member SELECT + unguarded `getReports` / `listExpenses` / `loadDashboard`. |
| Paynow webhooks | Sound | Hash + re-poll; never credit from redirect alone. |
| Authed rate-limit fail-open | P1 (accepted) | Prevents shop-load lockout when RPC is missing; abuse window if limiter is down. |
| `PLATFORM_ADMIN_USER_ID` env fallback | P1 | Full admin until DB bootstrap completes. |
| Marketplace browse SQL rate limit removed | P2 | Read-replica compatibility. |
| CSP `unsafe-inline` | P2 | Documented in `src/start.ts`. |
| Secrets printed in this report | None | |

---

## 5. Database findings

- 91 SQL migrations; staging applies a **subset** via `scripts/staging-manifest.mjs` (always re-applies onboarding journey + `create_business` unique).  
- Production apply is **manual** and **unguarded by deploy**. This is the same class of failure as leftover `create_business_with_owner` overloads and missing `get_business_feature_flags`.  
- `create_sale` 10-arg (split tenders) + unique-guard migration exist in git. **Unverified** on production.  
- `get_setup_progress` is the clear new SECURITY DEFINER hole.  
- Indexes and FKs are generally present; dedicated perf migration exists.  
- `auth.role()` still appears in older DEFINER functions in the safe `<> 'service_role'` pattern — P3.  
- No automated production schema diff in CI.

---

## 6. Performance findings

- Workspace Redis cache 60s; store pages `s-maxage=60`.  
- Report queries cap `sale_items` at 20,000.  
- Dashboard fires workspace + dashboard + storefront + notify-email queries. Acceptable.  
- No pagination on some admin lists (200-row caps). P3.  
- CI `cancel-in-progress` across the **entire repository** is a reliability problem, not a page-speed problem.

---

## 7. Deployment findings

| Item | Status |
| ----- | ------ |
| `master` CI `check` (tsc, lint, unit/integration if token, build) | Required before the `deploy` job on push |
| Staging SQL apply | Runs in CI; **exits 0 if token missing** |
| Integration tests | 71 tests skip without token; `check` still green |
| E2E | Hits `https://mykwetuu.com`; `continue-on-error: true`; read-only |
| `deploy-cloud-run.yml` `workflow_dispatch` | **Can deploy without CI** |
| `BILLING_ENABLED` | `"false"` in deploy env |
| Production SQL | Not in pipeline |
| Flush-mail workflow | **Failing** on current response shape |
| Latest master CI | #115 success (04:47 CAT, 3 Nov 2026) |

---

## 8. Shared root causes

These explain **multiple** symptoms. Fix the cause, not each screen.

1. **Production schema is not part of deploy.** Missing/overloaded RPCs surface as “couldn’t load your shop”, Create-shop errors, and empty feature flags. Staging can be healthy while production is not.  
2. **Repo-wide CI concurrency** (`staging-ci-${{ github.repository }}` + `cancel-in-progress: true`). A new PR cancels **master** CI/deploy. That is how #114’s master run died.  
3. **Two onboarding completion columns.** Post-auth (`onboarding_completed`) and in-app (`setup_completed_at`) disagree. Extra redirects and “why am I on /setup?” support load.  
4. **SECURITY DEFINER convenience without membership.** `get_setup_progress` skipped the check its sibling RPCs have.  
5. **Permission model is write-heavy.** UI hides reports from cashiers; API and RLS still allow member SELECT.  
6. **Provider integrations are code-complete, ops-incomplete.** Email, WhatsApp Cloud, shop Paynow, wildcard shop hosts. The flush-mail parser bug means even configured mail may never send on schedule.  
7. **Previous audit treated “page exists” as WORKING.** That hid P0/P1 items and is why this document is a replacement.

---

## 9. What is genuinely working (in code)

- Marketing nav with Sign in and Start a store.  
- Encrypted httpOnly session + PKCE Google start.  
- Workspace load that does **not** send an existing shop to onboarding when the query fails.  
- Authed rate-limit fail-open (shop-load lockout class).  
- `create_sale` atomic stock + payments + split tenders + unique idempotency key.  
- Offline POS queue with sequential replay.  
- Cash drawer RPCs.  
- Credit repayments, deposits, lay-by RPCs.  
- Server-side shop quote and unpaid-until-confirmed orders.  
- Manual shop payments stay pending until the seller confirms.  
- Paynow hash + re-poll (subscription and shop).  
- Publish vs preview vs not-live page.  
- Marketplace filters: published, visible, not suspended.  
- WhatsApp “sent” requires a provider message id.  
- Tenant-scoped writes via session JWT (not service role).  
- Staging SQL refuse-production-ref guard.

---

## 10. What is incomplete, visual-only, or configuration-blocked

| Item | Class |
| ---- | ----- |
| Product variants | Missing |
| Branch stock transfers | Missing |
| Business switcher / second shop | Missing (blocked in SQL) |
| Per-shop custom domains | Missing |
| POS EcoCash/InnBucks provider verify | Visual rail + bookkeeping only |
| ZIPIT as a distinct rail | Missing |
| Wholesale POS price | Column only |
| `wa.me` share/receipt | Visual send — human taps |
| WhatsApp Cloud / Resend | Code ready; flush cron broken; secrets unverified |
| Shop Paynow | Gated; often off |
| Platform subscription enforcement | Deployed with billing **off** |
| Shop `*.mykwetuu.com` | App ready; DNS/TLS ops |
| Capacitor / Tauri | Packaged, unverified |
| Legal pages | Draft placeholders for legal name |
| Admin SMS notes | Placeholder copy |
| Template preview sample products | Marketing placeholders (allowed) |

---

## 11. Prioritised repair plan (summary)

See `ISSUE_REGISTER.md` and `REPAIR_PLAN.md`.

| Batch | Goal | Approval needed? |
| ----- | ---- | ---------------- |
| 1 | Close `get_setup_progress` (P0) | No — additive SQL + `assertMember` |
| 2 | CI concurrency + flush-mail parser + fail loudly if staging SQL skipped | Yes for concurrency (affects every PR) |
| 3 | Auth/onboarding flag consistency, MFA reset, permission-load errors | No |
| 4 | `assertPermission` on reports / expenses / dashboard reads | No — behaviour change for cashiers using API |
| 5 | Production schema **diff only** (no apply) | Yes before any production SQL |
| 6 | POS advisory lock + pass location id | No |
| Deferred | Variants, transfers, switcher, custom domains, billing on, WhatsApp credentials, wildcard DNS | Yes — product / paid / irreversible |

**Stop conditions already hit:** production SQL apply, enabling billing, paying for WhatsApp Cloud / Resend / wildcard TLS, redesigning multi-business. None of those start without approval.

---

## 12. Tests executed this discovery pass

| Suite | Result |
| ----- | ------ |
| Explore-agent unit samples (`post-auth-destination`, `google-oauth`, `onboarding-resume`, `kwetuu-marketing`, `storefront`, `whatsapp-channel`) | Passed in those agents |
| Full `vitest` / `tsc` / production build | **Not re-run as a gate this pass** (no app change) |
| Staging integration | Not run (would need token; would write nothing to production) |
| Playwright against production | Not run (read-only smokes exist; not used as proof) |
| GitHub Actions observation | Master #115 success; #116 failure; #114 cancelled; flush-mail failing |

Do not treat this document as a passing test report.
