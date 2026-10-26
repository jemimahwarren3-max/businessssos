# Kwetuu pre-launch production checklist

**Purpose:** What must be **verified** before treating Kwetuu as production-ready — not a claim that items already pass.

**Statuses (use only these):**

| Status | Meaning |
| ------ | ------- |
| **Not verified** | Code or docs may exist; no acceptable test or operational evidence for launch. |
| **Built and tested** | Implemented and verified with named evidence (automated test, staging run, or documented manual run with date). |
| **Blocked or needs fixing** | Known gap, missing config, legal/ops dependency, or failed test. |

**Related docs:** `KNOWN_LIMITATIONS.md`, `PRODUCTION_GO_LIVE_CHECKLIST.md`, `EXECUTION_STATUS.md`, `STORE_OWNER_JOURNEY_AUDIT.md`, `MULTI_PLATFORM_PHASE_A_AUDIT.md`, `DESKTOP_AND_MOBILE.md`.

**Last evidence refresh:** 26 October 2026 (repository audit; not a full QA sign-off).

---

## Release gate tracker (Section 25)

Manual gates — tick only with attached evidence. **Current count: 0 / 21 passing.**

| # | Gate | Status | Evidence / blocker |
| - | ---- | ------ | ------------------ |
| 1 | No unresolved critical/high security without accepted exception | **Not verified** | `npm audit` in CI (continue-on-error); no launch sign-off |
| 2 | Tenant isolation + roles + server auth pass tests | **Not verified** | `tests/integration/*` skipped without `SUPABASE_ACCESS_TOKEN` |
| 3 | No production secrets in client/repo | **Built and tested** | `.env` gitignored; server-only keys; review in `PRODUCTION_SECURITY_CHECKLIST.md` |
| 4 | Unpaid publish / paid-feature bypass rejected server-side | **Blocked or needs fixing** | Node `assertCanOperate` on master (#64); **RPC bypass open**; **`BILLING_ENABLED` must be true in prod** |
| 5 | Payment verify + idempotent callbacks + entitlements | **Not verified** | Unit tests; Paynow sandbox/live not signed off |
| 6 | USD/ZiG calculations and records reconcile | **Not verified** | Checkout in SQL; ZiG display via `platform_fx`; no reconciliation worker |
| 7 | Seller setup → publish → manage under payment rules | **Not verified** | Flow exists; end-to-end not verified on staging |
| 8 | Customer order + seller fulfilment | **Not verified** | RPCs exist; E2E checkout not in CI |
| 9 | POS, receipts, inventory, history consistent | **Not verified** | POS + offline queue; no full reconciliation E2E |
| 10 | Offline sales survive restart, not discarded | **Not verified** | IndexedDB queue; no device restart E2E |
| 11 | Sync does not duplicate sales/stock | **Built and tested** | `tests/offline-sync.test.ts`; `create_sale` idempotency; POS race caveat in audits |
| 12 | Conflicts / unverified e-pay handled honestly | **Built and tested** | Design in `OFFLINE_AND_SYNC_DESIGN.md`; oversell flags; manual proof ≠ paid |
| 13 | Windows installer on clean machine + data persist | **Blocked or needs fixing** | Tauri scaffold PR #66; **not merged**; build on Windows untested |
| 14 | Signed Android APK on real devices | **Blocked or needs fixing** | Capacitor scaffold PR #66; v1 loads hosted URL; no release keystore |
| 15 | App updates do not corrupt DB / pending tx | **Not verified** | Not tested |
| 16 | Backup restore demonstrated | **Blocked or needs fixing** | Production DB not cut over; restore not run |
| 17 | Monitoring + support + incident ready | **Not verified** | Sentry optional; `INCIDENT_RESPONSE.md` exists |
| 18 | Production deploy + rollback tested | **Blocked or needs fixing** | `CLOUD_RUN_LAUNCH.md`: **deploy paused**; env separation incomplete |
| 19 | Privacy, terms, pricing, cancellation published | **Built and tested** | Live `/terms`, `/privacy` (Kwetuu rebrand #59); pricing pages exist |
| 20 | Critical journeys E2E pass | **Not verified** | `e2e/smoke.spec.ts` read-only; checkout journey missing |
| 21 | No known launch-blocking defect open | **Blocked or needs fixing** | See Section summaries below |

---

## 1. Product foundation and architecture

| Item | Status | Notes |
| ---- | ------ | ----- |
| Codebase audited before major changes | **Built and tested** | `MULTI_PLATFORM_PHASE_A_AUDIT.md`, `STORE_OWNER_JOURNEY_AUDIT.md`, `EXECUTION_STATUS.md` |
| Stack, schema, deploy documented | **Built and tested** | `ARCHITECTURE.md`, `CLOUD_RUN_LAUNCH.md`, migrations in `supabase/migrations/` |
| Regression baseline | **Built and tested** | `npm run verify:local` (typecheck, lint, unit, build) |
| Customer vs owner vs staff vs admin separation | **Built and tested** | Public routes vs `/_authenticated` vs `/admin`; permissions RPC |
| Web / desktop / Android shared logic | **Blocked or needs fixing** | Web + PWA; desktop/Android **hosted-shell v1** (PR #66), not bundled parity |
| Permissions / validation / errors defined | **Not verified** | Partial; many UI paths not disabled when read-only |
| Dev / staging / prod separated | **Blocked or needs fixing** | CI uses staging Supabase; deploy paused; prod Postgres not applied per `EXECUTION_STATUS.md` |
| Prod config without localhost | **Blocked or needs fixing** | Desktop/Android default URLs point at `mykwetuu.com` (OK); local dev uses `:8080` |
| Critical workflow automated tests | **Not verified** | Many integration tests **skipped** without staging token |
| No fake/demo-as-real data | **Built and tested** | Marketplace empty state; published shops from DB |
| Known limitations documented | **Built and tested** | `KNOWN_LIMITATIONS.md` |
| App version identification | **Not verified** | Web deploy hash informal; Tauri/Cap `0.1.0`; no unified client version API |

---

## 2. Registration, authentication and accounts

| Item | Status | Notes |
| ---- | ------ | ----- |
| Email/password registration | **Not verified** | Implemented; staging mail often blocked (#58 open) |
| Email verification delivers | **Blocked or needs fixing** | Supabase SMTP / autoconfirm operator-dependent |
| Login/logout web | **Built and tested** | PKCE/callback fixes merged (#57); not re-run on prod today |
| Login/logout Windows/Android | **Not verified** | Hosted shell only; PR #66 |
| Google sign-in without loops | **Built and tested** | #57 merged; operator redirect URLs required |
| Password reset E2E | **Not verified** | Routes exist |
| Invalid/expired auth links | **Not verified** | |
| Session after app restart (native) | **Not verified** | Cookie on hosted domain in WebView |
| Change email/password | **Not verified** | Settings routes exist |
| Session revoke | **Not verified** | |
| Suspended/deleted accounts | **Not verified** | |
| Safe auth error messages | **Not verified** | |
| Rate limits on auth | **Built and tested** | `check_rate_limit` in migrations / server |
| No cross-user access via URL/ID | **Not verified** | RLS + membership; integration tests skipped |
| Account deletion / export | **Not verified** | Export route exists |
| Staff invites | **Not verified** | Team module; no billing gate on invites |

---

## 3. Store creation, launch and publication

| Item | Status | Notes |
| ---- | ------ | ----- |
| Draft setup + return later | **Built and tested** | Onboarding + storefront save |
| Branding, slug, template, preview | **Built and tested** | `storefront.tsx`, templates, `host.ts` |
| Reserved slugs / validation | **Built and tested** | `RESERVED_HOST_LABELS`, SQL |
| Fulfilment + payment options for publish | **Built and tested** | `set_storefront_published` checks |
| Launch checklist visible | **Not verified** | Partial UI checklist |
| **Server-side publish authorization** | **Blocked or needs fixing** | `assertCanPublish` (Node); **RPC has no subscription check** |
| **Unpaid API bypass** | **Blocked or needs fixing** | Direct `set_storefront_published` as `authenticated` |
| Separate launch fee vs subscription | **Blocked or needs fixing** | **Subscription only**; no launch-fee table |
| Failed payment must not publish | **Not verified** | Paynow confirm is server-side; publish not tied to payment row |
| Idempotent payment entitlements | **Built and tested** | `paynow_confirm_payment` pattern |
| Unpublish/republish rules | **Not verified** | Unpublish without paid gate |
| Expired sub preserves data | **Built and tested** | By design; shop may stay **public** until unpublish policy added |
| Status consistent web/desktop/android | **Not verified** | Same hosted backend when shells used |

### Launch-state rules (target vs today)

| State | Target | Today (honest) |
| ----- | ------ | -------------- |
| Draft | Prepare; not public | **Built and tested** (`draft`) |
| Awaiting payment | Instructions visible | **Not verified** (billing UI; trial vs pay messaging) |
| Payment pending | No publish until verified | **Blocked or needs fixing** (publish gated on **`active`**, not pending Paynow row) |
| Active | Store + features | **Not verified** end-to-end |
| Subscription expired | Grace + restrict | **Blocked or needs fixing** (no grace in code; `past_due` weak) |
| Suspended | Policy-driven | **Not verified** (admin partial) |
| Admin exemption | Audited | **Built and tested** (platform owner bypass + audit tables; staging not run) |

---

## 4. Subscription, launch fees and payment security

| Item | Status | Notes |
| ---- | ------ | ----- |
| Single Pro USD plan | **Built and tested** | `billing-plans.ts` |
| ZiG display policy | **Built and tested** | `platform_fx`; Paynow USD |
| **Independent launch fee** | **Blocked or needs fixing** | Not implemented |
| Provider success verified server-side | **Built and tested** | Paynow poll + hash |
| Idempotent webhooks/callbacks | **Built and tested** | Payment status `created` gate |
| No trust in client redirect alone | **Built and tested** | |
| Renewal / grace / expiry | **Blocked or needs fixing** | Grace legal copy only |
| Shop customer payments ≠ platform billing | **Built and tested** | Documented; platform keys billing-only |
| Minor units / float | **Not verified** | SQL `numeric`; JS display float |
| Critical launch test (unpaid bypass) | **Not verified** | **Must run manually** after `BILLING_ENABLED=true` + SQL guards |

---

## 5. Customer storefront and shopping

| Item | Status | Notes |
| ---- | ------ | ----- |
| Homepage + discover stores | **Built and tested** | Marketing + `/stores` |
| Store branding + direct links | **Not verified** on prod wildcard DNS |
| Search/filter/categories | **Partial** | Marketplace; Postgres `ilike` |
| **No variants** | **Blocked or needs fixing** | `KNOWN_LIMITATIONS.md` |
| Server-side checkout totals | **Built and tested** | `create_store_order` |
| Manual proof ≠ auto paid | **Built and tested** | Payment safety migrations |
| Slow network / mobile | **Not verified** | |
| Empty/error states | **Not verified** | |

---

## 6. Seller dashboard and store management

| Item | Status | Notes |
| ---- | ------ | ----- |
| Dashboard from real DB | **Built and tested** | Loaders + RPCs |
| Product CRUD | **Built and tested** | |
| Variants | **Blocked or needs fixing** | Not built |
| Online vs POS visibility | **Partial** | Listing publish flags; not full matrix in spec |
| Orders + fulfilment | **Not verified** | Implemented; ops not verified |
| Reports / CSV | **Not verified** | Reports route exists |
| Staff permissions | **Not verified** | `has_permission`; tests skipped |

---

## 7. Point of sale (POS)

| Item | Status | Notes |
| ---- | ------ | ----- |
| POS search / barcode | **Built and tested** | `sales.tsx`, zxing |
| Totals / payment methods | **Built and tested** | |
| Unique sale id + idempotency | **Built and tested** | UUID + RPC |
| Receipts view/reprint | **Not verified** | |
| Cash drawer | **Built and tested** | Required online for cash; offline exception documented |
| Voids/refunds audit | **Partial** | Refunds exist; full POS void policy not verified |
| Duplicate sale prevention | **Not verified** | Idempotency; race noted in audits |

---

## 8. Full offline mode

| Item | Status | Notes |
| ---- | ------ | ----- |
| Initial sync download | **Partial** | Product cache on use, not full “offline pack” |
| Online/offline/sync UI | **Built and tested** | Sales page queue |
| Durable sale before confirm | **Built and tested** | IndexedDB before UI success |
| Survives reload | **Not verified** | Unit tests only |
| **Offline acceptance test (Section 8)** | **Not verified** | **Mandatory before launch claim** |
| Offline entitlement TTL | **Blocked or needs fixing** | Not implemented |
| Background sync when app closed | **Blocked or needs fixing** | No Workbox background sync |

---

## 9. Inventory and transaction integrity

| Item | Status | Notes |
| ---- | ------ | ----- |
| Server source of truth | **Built and tested** | Movements on `create_sale` |
| Concurrent online/offline | **Not verified** | Oversell fails sync; policy documented |
| Negative stock policy | **Not verified** | |
| Product delete preserves history | **Built and tested** | Soft patterns / FKs in schema |
| Import validation | **Partial** | CSV/Excel tests partial |

---

## 10. Windows desktop (Tauri 2)

| Item | Status | Notes |
| ---- | ------ | ----- |
| Production build | **Not verified** | PR #66; Linux CI lacks webkit deps |
| Clean Windows install | **Not verified** | Requires Windows machine |
| No dev server in release | **Blocked or needs fixing** | Release window uses **hosted URL** v1 |
| Offline at OS network level | **Not verified** | Same as PWA when on local dev build |
| Signing / SmartScreen | **Blocked or needs fixing** | Not started |
| Versioning | **Partial** | `0.1.0` in `tauri.conf.json` |

---

## 11. Android APK (Capacitor)

| Item | Status | Notes |
| ---- | ------ | ----- |
| Release APK build | **Not verified** | Gradle project in PR #66 |
| No dev URL in release | **Blocked or needs fixing** | Default `server.url` = production staff login (intentional v1) |
| Release signing | **Blocked or needs fixing** | No keystore in repo (correct) |
| Lifecycle / back button | **Not verified** | |
| Physical device tests | **Not verified** | |

---

## 12. Database, Supabase and backend

| Item | Status | Notes |
| ---- | ------ | ----- |
| Migrations version-controlled | **Built and tested** | |
| **Production migrations applied** | **Blocked or needs fixing** | Explicitly not done |
| RLS enabled | **Built and tested** | Migrations |
| RLS tested per role | **Not verified** | Staging tests skipped |
| Service role not in client | **Built and tested** | |
| Server-side business rules | **Partial** | Many in Node; not all in RPC |
| Indexes / performance | **Not verified** | No load test |

---

## 13. Security and abuse prevention

| Item | Status | Notes |
| ---- | ------ | ----- |
| CSP / headers | **Built and tested** | `src/start.ts` |
| CSRF on server functions | **Built and tested** | `createCsrfMiddleware` |
| Rate limits | **Built and tested** | Multiple RPCs |
| **Direct RPC billing bypass** | **Blocked or needs fixing** | See Section 3 |
| Dependency scan | **Not verified** | CI audit continue-on-error |
| Desktop/Android security review | **Not verified** | |

---

## 14. Staff roles and platform admin

| Item | Status | Notes |
| ---- | ------ | ----- |
| RBAC | **Built and tested** | Roles + permissions |
| Admin area | **Partial** | Routes exist; not fully verified |
| Owner bootstrap | **Blocked or needs fixing** | `PLATFORM_OWNER_BOOTSTRAP.md`; not applied |

---

## 15. Notifications and email

| Item | Status | Notes |
| ---- | ------ | ----- |
| Auth email | **Blocked or needs fixing** | PR #58; Supabase SMTP operator task |
| Order email | **Not verified** | Outbox + Resend; needs secrets + cron |
| WhatsApp | **Blocked or needs fixing** | Links only; not Business API |

---

## 16–24. Reports, reliability, backups, monitoring, legal, a11y, QA, deploy, business readiness

**Summary status:** Predominantly **Not verified** or **Blocked or needs fixing**.

| Section | Highlights |
| ------- | ---------- |
| **16 Reports** | Reports exist; reconciliation not verified |
| **17 Reliability** | No load test; duplicate-click idempotency partial |
| **18 Backups** | **Blocked** — restore not demonstrated |
| **19 Monitoring** | Sentry wired; alerts not proven |
| **20 Legal** | Terms/privacy live; fiscalisation **Blocked** |
| **21 Accessibility** | **Not verified** |
| **22 Automated tests** | `verify:local` **Built and tested**; staging/E2E/desktop/android **Not verified** |
| **23 Deployment** | **Blocked** — paused deploy; `BILLING_ENABLED` operator |
| **24 Business readiness** | Pilot, support SLAs, finalized pricing ops **Not verified** |

---

## 26. Recommended implementation order (aligned with your phases)

| Phase | Focus | Repo status |
| ----- | ----- | ----------- |
| **1 Audit** | Baseline | **Done** — docs above |
| **2 Security + payments** | RLS tests, `BILLING_ENABLED`, SQL `business_can_operate`, launch-fee decision | **In progress** (#64 merged; RPC + prod env open) |
| **3 Core workflows** | E2E checkout, publish journey, mail | **Not verified** |
| **4 Offline dependable** | Acceptance test, entitlement JWT, background sync | **Partial** |
| **5 Packaged apps** | Merge #66, Windows `.exe`, signed APK, bundled client | **Scaffold only** |
| **6 Launch proof** | Gates 1–21, pilot, backup restore | **0 / 21** |

---

## How to use this checklist

1. For each **Blocked or needs fixing** item, link a GitHub issue or PR and retest.
2. Move to **Built and tested** only with: test name + date, or signed manual test log (include environment URL).
3. Run **`npm run verify:staging`** with `SUPABASE_ACCESS_TOKEN` before claiming tenant/payment gates.
4. Run the **offline acceptance test** (Section 8) on web PWA and again inside Capacitor/Tauri after bundled client exists.
5. Do not launch on **hosted-shell-only** desktop/Android alone if you promise offline-first POS without network to `mykwetuu.com`.

**This document does not certify launch readiness.** It records audit status as of the date above.
