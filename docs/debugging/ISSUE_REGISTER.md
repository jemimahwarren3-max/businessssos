# Kwetuu Issue Register

**Date:** 2026-11-03

---

## P2: Medium

### ISS-001 — TypeScript errors in store/market routes
- **Module:** Public store routes
- **Severity:** P2
- **Description:** 6 implicit `any` type errors in `market.tsx` (3), `store.$slug.cart.tsx` (1), `store.$slug.products.$productSlug.tsx` (1), `store.$slug.search.tsx` (1). All are missing type annotations on `.filter()` / `.map()` / `search` callbacks.
- **Root cause:** Pre-existing — these files were authored without `noImplicitAny` annotations on array callbacks.
- **Affected files:** `src/routes/market.tsx`, `src/routes/store.$slug.cart.tsx`, `src/routes/store.$slug.products.$productSlug.tsx`, `src/routes/store.$slug.search.tsx`
- **Proposed fix:** Add type annotations to the 6 callback parameters.
- **Verification:** `tsc --noEmit` passes with 0 errors.
- **Status:** Open

### ISS-002 — No unit tests
- **Module:** Testing
- **Severity:** P2
- **Description:** Zero `*.test.*` or `*.spec.*` files in `src/`. Only 2 shallow e2e smoke specs exist in `e2e/`. Business logic (calculations, formatting, billing gates) has no test coverage.
- **Root cause:** Tests were never written — the application was built feature-first.
- **Affected files:** Entire `src/` directory
- **Proposed fix:** Add targeted unit tests for: billing gate functions, format utilities, sales calculation logic, permission helpers. Add integration tests for critical RPCs.
- **Verification:** `vitest run` shows passing suite.
- **Status:** Open

### ISS-003 — Dashboard does not redirect to /setup for new businesses
- **Module:** Onboarding
- **Severity:** P2
- **Description:** The onboarding redesign introduces a guided `/setup` workspace, but `dashboard.tsx` does not yet redirect businesses with `setup_completed_at === null` to `/setup`.
- **Root cause:** Onboarding rewrite is in progress — this guard hasn't been added yet.
- **Affected files:** `src/routes/_authenticated/dashboard.tsx`
- **Proposed fix:** Add `useEffect` in dashboard that checks `workspace.data?.business.setup_completed_at` and redirects to `/setup` if null.
- **Verification:** Create a new business → lands on `/setup`, not `/dashboard`. Existing businesses go to `/dashboard`.
- **Status:** Open

### ISS-004 — Email delivery depends on Resend configuration
- **Module:** Notifications
- **Severity:** P2
- **Description:** Email outbox pattern is complete in code, but actual delivery depends on `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL` being set in the deployment environment. If not configured, emails queue in the outbox but never send.
- **Root cause:** Deployment configuration — not a code bug.
- **Affected files:** `src/lib/notifications.mail.server.ts`
- **Proposed fix:** Verify Resend credentials are configured in staging and production. The admin `/admin/health` page already shows email delivery status.
- **Verification:** Admin health check shows "mail: ok". Test email sends successfully.
- **Status:** Open (deployment)

---

## P3: Low

### ISS-005 — Deprecated `auth.role()` in SECURITY DEFINER functions
- **Module:** Database
- **Severity:** P3
- **Description:** 16 uses of `auth.role()` (deprecated Supabase API) in SECURITY DEFINER functions. All use the safe pattern `auth.role() <> 'service_role'` (not the dangerous `= 'authenticated'` pattern).
- **Root cause:** Functions written before Supabase deprecated the API.
- **Affected files:** Various migration files
- **Proposed fix:** Future migration to replace with `current_setting('request.jwt.claims', true)::json->>'role'`. Not urgent.
- **Verification:** Functions behave identically after replacement.
- **Status:** Open (future)

### ISS-006 — Console.error density in payment code
- **Module:** Payments
- **Severity:** P3
- **Description:** `shop-paynow.server.ts` (14 console.error), `paynow.server.ts` (10), `launch-fee.server.ts` (9). High for server files, though server-side logging is appropriate. May benefit from structured logging.
- **Root cause:** Payment integration paths have many error branches that are all logged.
- **Affected files:** `src/lib/storefront/shop-paynow.server.ts`, `src/lib/paynow.server.ts`, `src/lib/storefront/launch-fee.server.ts`
- **Proposed fix:** No change needed — these are legitimate server-side error logs. Could migrate to structured logger in future.
- **Verification:** N/A
- **Status:** Informational

### ISS-007 — Trialing businesses blocked from POS operations
- **Module:** Billing
- **Severity:** P3
- **Description:** `canOperateForSubscription` blocks trialing businesses from POS sales and store publishing. This is a conscious design choice ("trialing is setup-only") but could frustrate new users wanting to test the full flow during their 14-day trial.
- **Root cause:** Intentional design decision in billing gate logic.
- **Affected files:** `src/lib/billing-write.ts`
- **Proposed fix:** Consider allowing POS during trial (change `canOperateForSubscription` to treat trialing like active). Requires product decision.
- **Verification:** Trialing user can complete a POS sale.
- **Status:** Open (product decision)

### ISS-008 — Onboarding migration not yet applied to staging
- **Module:** Database
- **Severity:** P3
- **Description:** `20261103080000_onboarding_journey.sql` exists in the migrations directory but has not been applied to staging Supabase (`slajanbsfqjnuuiohbmg`).
- **Root cause:** Onboarding work is in progress.
- **Affected files:** `supabase/migrations/20261103080000_onboarding_journey.sql`
- **Proposed fix:** Apply migration to staging after review.
- **Verification:** New RPCs (`get_setup_progress`, `mark_setup_complete`, `save_onboarding_config`, `save_onboarding_settings`) callable from staging.
- **Status:** Open (pending approval)

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| P0 Critical | 0 | No data leakage, secret exposure, or financial corruption |
| P1 High | 0 | No auth failures, POS failures, or broken storefronts |
| P2 Medium | 4 | TS errors, no tests, missing redirect, email config |
| P3 Low | 4 | Deprecated API, log density, billing gate UX, migration pending |
| **Total** | **8** | |
