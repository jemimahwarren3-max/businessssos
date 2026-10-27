# Kwetuu multi-platform — Phase A audit and compatibility report

**Date:** 26 October 2026  
**Repository:** Kwetuu (`jemimahwarren3-max/businessssos`)  
**Spec:** Web + Tauri Windows + Android APK, shared Supabase, offline POS, secure entitlements  
**Rule:** Extend the existing app; do not rebuild.

This report satisfies **Phase A / Phase zero** of the implementation plan. No Tauri or Capacitor code exists in the repo yet. Payment tiering fixes are on PR [#64](https://github.com/jemimahwarren3-max/businessssos/pull/64) (branch `cursor/payment-enforcement-dafe`).

---

## 1. What the application actually is (not assumptions)

| Area | Actual state |
| ---- | ------------ |
| Framework | **TanStack Start 1.168** on **React 19**, **Vite 8**, **TypeScript**, **Nitro `node-server`** preset — not a static Vite SPA only. |
| Routing | TanStack Router file routes under `src/routes/`. |
| Merchant app | `/_authenticated/*` with **`ssr: false`** (client-rendered). |
| Public web | Marketing, auth, `{slug}.mykwetuu.com` storefronts — SSR/server handlers. |
| Backend | **Supabase Auth + Postgres** (RLS, security-definer RPCs). |
| App server | **Node** (Cloud Run historically): TanStack **server functions** (`createServerFn`), Paynow webhooks, session cookies, service-role modules in `*.server.ts`. |
| Local DB | **IndexedDB** via `idb` (`src/lib/offline/db.ts`), not Dexie. |
| PWA | **vite-plugin-pwa** / Workbox — precache JS/CSS; SW registered only after sign-in (`src/lib/pwa-register.ts`). |
| Desktop / Android | **None** — no Tauri, Capacitor, or Electron in tree. |

**Implication:** Packaging is not “drop `dist/` into Tauri.” The merchant dashboard depends on **HTTP calls to the same origin** for most mutations (server functions → Node → Supabase). A desktop APK must either bundle the **client** and target a **configured API base URL** (production/staging Node), or load the **hosted** app in a WebView (online-first wrapper).

---

## 2. What works today

### Web (Kwetuu Web)

- Public storefront, marketplace, checkout (server-side pricing/stock via RPCs).
- Auth: email + Google (browser PKCE / callback routes documented in auth migrations and routes).
- Merchant: onboarding, products, inventory, POS, cash drawer, invoices, storefront builder, templates, settings, billing UI.
- Subdomain routing: `src/lib/storefront/host.ts`, `SHOP_HOSTS`, 308 from `/store/{slug}`.
- Deploy: GitHub **CI** builds and tests; **Cloud Run deploy workflow removed/paused** (`docs/CLOUD_RUN_LAUNCH.md`) — production env may be stale.

### Payments and subscriptions

- Single **Pro** plan (~$7/mo USD in `billing-plans.ts`); **3-day trial** on `create_business_with_owner`.
- **Paynow** platform subscription: `paynow.server.ts`, `paynow_confirm_payment` (idempotent).
- **No separate launch-fee table** — “pay when you publish” is implemented as **first paid subscription** (`active`), not a one-time SKU.
- Shop checkout: manual proof / seller confirm; seller Paynow gated (`shop_offers_paynow`).

### Offline (partial — web/PWA only)

- **POS offline queue:** `sales.tsx` + `src/lib/offline/sync.ts` + IndexedDB `pendingSales`.
- **Product cache** for search while offline; optimistic local stock decrement.
- **Idempotency:** client UUID → `create_sale` RPC + unique `(business_id, idempotency_key)`.
- **Documented limits:** `docs/OFFLINE_AND_SYNC_DESIGN.md`, `docs/KNOWN_LIMITATIONS.md`.
- **Not offline:** inventory adjustments, auth, reports, storefront checkout, sync when app/tab closed (no Background Sync).

### Payment enforcement (after PR #64)

- **`BILLING_ENABLED`:** when `"false"`, all write gates off (`feature-flags.server.ts`).
- **Setup vs operate:** trialing can edit drafts; **publish, POS, cash drawer** require **`active`** when billing on (`assertCanOperate` / `assertCanPublish`).
- **Detail:** `docs/STORE_OWNER_JOURNEY_AUDIT.md`.

---

## 3. What is partial

| Feature | Status |
| ------- | ------ |
| Store setup wizard | Onboarding + storefront checklist; not one unified stepper with persisted step index. |
| Launch fee vs subscription | Marketing copy only; one subscription row in DB. |
| Grace period | Terms mention; code does not extend `canWriteForSubscription` for `past_due`. |
| `current_period_end` | Not enforced on `active` rows in Node gates. |
| Offline entitlement JWT | Not implemented — offline POS does not check a signed TTL. |
| Sync engine | FIFO single-sale upload; no Dexie, no device registry, no backoff service worker. |
| Receipts offline | Sale completes locally; receipt is UI/state + pending row — no separate receipt store. |
| Product image pipeline | `product-image-optimizer.ts` (recent on master) — client resize before upload. |
| DB billing gates | RPCs like `create_sale`, `set_storefront_published` grant **`authenticated`** execute without subscription check. |

---

## 4. What is missing (vs your spec)

- Tauri 2 Windows installer (`.exe` / NSIS).
- Android APK (Capacitor or Tauri Android) + signing pipeline.
- Platform layer (`web` | `desktop` | `android`) for capabilities.
- Shared **offline transaction engine** spec completeness: device ID, minor units policy, receipt store, conflict review UI, background sync.
- **Signed offline entitlement** from server.
- **Launch fee** entity if product requires fee ≠ first month subscription.
- Download page with checksums, version metadata, sideload instructions.
- Windows code signing / auto-update (documented as future).
- Native printing (Windows/Android) beyond browser print.
- Postgres **`assert_business_can_operate()`** (or equivalent) inside critical RPCs.

---

## 5. Why unpaid users could access paid features

| Root cause | Mechanism |
| ---------- | --------- |
| **`BILLING_ENABLED=false` in production** | All `canWrite*` helpers return allow. Operator must set `true` on Cloud Run/host. |
| **Trial treated as paid (fixed in #64)** | Previously trialing could publish and run POS. |
| **UI-only hints** | `isReadOnly` / `isOperateLocked` banners; buttons often still clickable until server rejects. |
| **Direct Supabase RPC** | e.g. `grant execute on create_sale … to authenticated` — membership/permission checks inside RPC, **not subscription**. |
| **Published shops stay live** | No cron to unpublish on subscription lapse. |
| **Installed PWA/desktop (future)** | Cached shell does not bypass server if gates are on; **offline queue** could still attempt sync — server must reject (`assertCanOperate` on `createSale`). |
| **No offline entitlement expiry** | Once cached, POS could add sales until sync fails; no local signed “paid until” window. |

---

## 6. Backend operations that permit unauthorised access (residual risk)

**Protected well (via Node server functions):** Most `business.server.ts` / `storefront.server.ts` mutations that call `assertCanWrite` / `assertCanOperate` before RPC.

**Examples still weak if billing must be DB-authoritative:**

| Operation | RPC / path | Gap |
| --------- | ---------- | --- |
| Create sale | `create_sale` | No subscription check in SQL; relies on Node `createSale`. |
| Publish store | `set_storefront_published` | Setup rules only; no subscription in SQL. |
| Cash session | `open_cash_session`, etc. | Node gate added in #64; RPC unchanged. |
| Team invites | `team.server.ts` | Permission only, no billing gate (may be OK). |
| AI drafts | `ai-builder.server.ts` | No `assertCanWrite` (low $ risk). |

**Recommendation (Phase 2C in your plan):** Add `public.business_can_operate(_business_id uuid)` security definer, called at start of `create_sale`, `set_storefront_published` (when `_published true`), etc.

---

## 7. Reuse map (do not duplicate)

| Spec concept | Existing artifact |
| ------------ | ----------------- |
| Profiles / users | Supabase Auth + `profiles` |
| Workspace / business | `businesses`, `business_members`, `get_my_permissions` |
| Stores | `storefronts`, listings, `set_storefront_published` |
| Products | `products`, `product-media` |
| Inventory movements | `inventory_movements`, inside `create_sale` |
| Sales | `sales`, `sale_items`, `create_sale` |
| Payments (platform) | `subscriptions`, `subscription_payments`, Paynow RPCs |
| Offline queue | IndexedDB `pendingSales`, `PendingSale` type |
| Idempotency | `idempotency_key` on sales |
| PWA shell | VitePWA + `_authenticated` registration |
| Entitlements (admin) | `platform_entitlements`, `has_platform_subscription_bypass` |

**New tables only if needed:** `store_launch_payments`, `offline_device_entitlements`, `sync_operations` — none exist; add only after schema review.

---

## 8. Tauri 2 (Windows) — compatibility risks

| Risk | Severity | Notes |
| ---- | -------- | ----- |
| TanStack Start **server functions** | **High** | Merchant UI calls same-origin POST handlers. Bundled desktop must set **API base URL** to hosted Node (e.g. `https://mykwetuu.com`) or ship embedded Node (heavy, not recommended v1). |
| Session cookies | **Medium** | httpOnly session cookie must work in WebView2; test OAuth redirect + PKCE in Tauri. |
| `APP_URL` / CORS / CSP | **Medium** | Build-time `VITE_*` Supabase keys; server URL for RPCs. |
| Offline | **Low–Med** | Same IndexedDB as PWA if WebView supports it; **sync still needs network** to Node/Supabase. |
| Storefront in desktop | **Low** | Spec says owners use app for ops; customers stay on web — OK. |
| Public site in same binary | **Optional** | Can scope desktop `start_url` to `/dashboard` or `/staff-login`. |

**Recommended Windows POC (Phase B):**

1. `npm create tauri-app` or add Tauri 2 to monorepo with `frontendDist` = TanStack client output (`.output/public` after `npm run build`).
2. Configure **devUrl** / production **remote API** for server functions (TanStack Start env — verify `SERVER_URL` or documented pattern for split client/host).
3. Milestone: window opens → staff login → dashboard loads workspace via existing auth.

**Cloud agent VM:** Rust (`rustc`) present; **Android SDK not installed** — Android POC must run on a developer machine with Android Studio.

---

## 9. Android — Capacitor vs Tauri 2

| Criterion | Capacitor | Tauri 2 Android |
| --------- | --------- | ----------------- |
| Fit with existing WebView app | **Mature** for Vite/React SPAs | Newer; WebView + Rust shell |
| TanStack Start server deps | Same **remote API** requirement | Same |
| Back button / lifecycle | Capacitor plugins well documented | Requires explicit handling |
| APK signing | Standard Gradle + keystore | Tauri Android toolchain |
| Team familiarity | Higher for “wrap the web app” | One stack if Windows also Tauri |

**Recommendation:** Run **two 1-day spikes**:

1. **Capacitor:** `@capacitor/android`, `webDir` → client build, load `/staff-login`, sign debug APK.
2. **Tauri Android:** only if Windows is already Tauri and mobile build is stable in CI.

Choose **Capacitor for APK v1** if spikes show faster auth + IndexedDB parity; keep **Tauri for Windows**.

**Do not** embed `http://localhost` or dev server URL in release builds.

---

## 10. Mapping your six phases to Kwetuu

| Your phase | Kwetuu status | Next action |
| ---------- | ------------- | ----------- |
| **1 Audit + packaging proof** | This document + no Tauri/Capacitor yet | Windows Tauri POC; Capacitor debug APK on dev machine |
| **2 Secure activation** | Partial (#64 Node gates) | Merge #64; `BILLING_ENABLED=true`; SQL `business_can_operate`; launch fee decision |
| **3 Offline transaction engine** | **Partial** (queue + idempotency) | Dexie optional; receipt records; device ID; expand tests |
| **4 Package desktop/Android** | Not started | After POC passes |
| **5 Native capabilities** | Not started | Print, secure storage plugins after Milestone 3 |
| **6 Test, sign, distribute** | Not started | Download page, checksums, keystore outside repo |

Your **execution order A→H** aligns: **A done (this doc)**, **B next**, then **C** (DB enforcement) in parallel with offline hardening **D–F**.

---

## 11. Breaking changes / migrations (avoid for now)

- **Do not** reset Supabase.
- **Safe additive migrations (later):** `offline_entitlements`, `store_launch_payments`, RPC guards.
- **Risky:** Splitting merchant app into pure SPA without server functions (large rewrite — **reject**).
- **Risky:** Moving all logic to client Supabase calls (exposes data model, bypasses Node Paynow/secrets).

---

## 12. Environment and tooling checklist

| Requirement | Repo / VM |
| ----------- | --------- |
| Node ≥ 22.12 | `package.json` engines |
| `npm run verify:local` | Passes on agent |
| Rust | Available on cloud VM |
| Android SDK / JDK | **Not on cloud VM** — local only |
| Supabase secrets | Never in client bundle; `VITE_*` publishable key only |
| Keystore | **Never commit** |

---

## 13. Milestones (your order — unchanged)

1. **Windows:** Install → login → dashboard (hosted API OK for v1).
2. **Android APK:** Same account on phone.
3. **Offline sell:** Disconnect → sale → restart → sync once (extend existing queue tests + manual airplane mode).
4. **Secure paid access:** Merge enforcement + SQL RPC guards + staging integration tests.

---

## 14. Phase A conclusion — proceed to Phase B?

**Yes, with constraints:**

- Do **not** rewrite TanStack Start as SPA first.
- **Phase B** = minimal Tauri Windows shell + Capacitor Android spike, both targeting **production or staging API** for server functions.
- **Phase C** = merge PR #64 + database subscription guards before marketing desktop APK widely.

**Stop conditions (do not continue packaging if):**

- Auth/session cannot be restored in WebView without unsafe cookie hacks.
- Server function base URL cannot be configured for split client/host build.
- IndexedDB unavailable in chosen WebView (unlikely on Win/Android).

---

## 15. Related docs

- `docs/STORE_OWNER_JOURNEY_AUDIT.md` — payment and lifecycle
- `docs/OFFLINE_AND_SYNC_DESIGN.md` — offline matrix
- `docs/ARCHITECTURE.md` — trust boundaries
- `docs/CLOUD_RUN_LAUNCH.md` — deploy pause and env separation

---

## 16. Tests already in repo (regression baseline)

- `tests/billing-write.test.ts` — subscription gates
- `tests/offline-sync.test.ts` — queue order / idempotency
- `tests/integration/billing-security.test.ts` — staging Paynow idempotency (needs token)
- `npm run verify:local` — typecheck, lint, unit, build

Add when packaging lands: smoke script “desktop loads login”, “Capacitor WebView reaches Supabase ping”.
