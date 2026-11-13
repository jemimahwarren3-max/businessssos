# Kwetuu Issue Register

**Date:** 13 November 2026 (Africa/Harare) — delta in `FULL_AUDIT_2026-11-13.md`  
**Head (last full review):** `7ee7db7` (origin/master after PR #138)  
**Supersedes:** the 8-item register from the onboarding-journey draft (`ISS-001`–`ISS-008`). Those IDs are retired. Several of those items are already fixed (`ISS-003` dashboard `/setup` redirect) or were mis-severity (`ISS-008` staging journey SQL is now in the manifest).

Status values: **Open** · **Open (approval)** · **Open (ops)** · **Open (product)** · **Informational** · **Mitigated** · **Fixed**.

Stage 4 repair batches continue; see `FULL_AUDIT_2026-11-13.md` for November sweep.

---

## P0: Critical

### KW-001: `get_setup_progress` leaks another business’s setup stats

- **Module:** Onboarding / multi-tenant security
- **Severity:** P0
- **Description:** `get_setup_progress(uuid)` is `SECURITY DEFINER` and granted to `authenticated`. It does **not** check `auth.uid()` membership. Any signed-in user (merchant or shopper) who knows or guesses a `business_id` can read `product_count`, `sale_count`, `has_customers`, `has_team`, `storefront_enabled`, and `onboarding_config` (contact/address-shaped JSON). The Node wrapper `getSetupProgress` / `getSetupProgressFn` also skips `assertMember`. Sibling RPCs `mark_setup_complete`, `save_onboarding_config`, and `save_onboarding_settings` correctly require owner membership.
- **User experience:** A stranger with a Kwetuu login can inspect whether a shop exists, how many products/sales it has, and onboarding answers.
- **What should happen:** Only a member of that business (or a platform admin via a dedicated path) can read setup progress.
- **What actually happens:** PostgREST + the server function both execute the DEFINER body for any authenticated caller.
- **Root cause:** New journey RPC copied the return shape but not the membership guard used on the write RPCs in the same file.
- **Affected files:** `supabase/migrations/20261103080000_onboarding_journey.sql` (function at `get_setup_progress`); `src/lib/business.server.ts` (`getSetupProgress`); `src/lib/business.functions.ts` (`getSetupProgressFn`)
- **Proposed fix:** Small additive migration: `CREATE OR REPLACE` with `is_business_member(_business_id, auth.uid())` (or owner-only, matching writes). Raise on failure. Add `assertMember` in `getSetupProgress`. Do **not** disable RLS. Add a staging isolation assertion.
- **Verification test:** Staging: user A cannot `rpc get_setup_progress` for user B’s business. Unit: handler calls `assertMember`.
- **Status:** **Mitigated** in git (Nov 2026): `assertMember` in `getSetupProgress`; `20261103100000_get_setup_progress_member.sql` on staging manifest. `20261104010000_security_hardening.sql` exists but is **not** on manifest. Mark **Fixed** only after direct RPC probe on staging/production confirms `B0020` for non-members.
- **DB change:** Yes, non-destructive `CREATE OR REPLACE FUNCTION`
- **External dependency:** None

---

## P1: High

### KW-036: Dashboard launch steps only change the URL hash

- **Module:** Storefront / dashboard
- **Severity:** P1
- **Description:** The launch centre on `/dashboard` used `<a href="#launch-publish">` (and similar). Those section ids live on `/storefront`, and several (`launch-design`, `launch-payments`, `launch-publish`) did not exist at all. Clicking a step left the merchant on `https://mykwetuu.com/dashboard#launch-publish` with no navigation.
- **Root cause:** Same component on dashboard and storefront; hashes assumed in-page targets.
- **Affected files:** `src/lib/storefront/launch-status.ts`, `src/components/storefront/store-launch-centre.tsx`, `src/components/storefront/store-builder.tsx`, `src/components/storefront/store-launch-readiness.tsx`, `src/routes/_authenticated/storefront.tsx`
- **Proposed fix:** Each step is a TanStack `Link` to `/storefront` (or `/notifications`) with a hash. Add missing ids. Open the matching builder tab before scrolling.
- **Verification test:** `tests/store-launch-status.test.ts`, steps `to` `/storefront` with hashes; every storefront hash maps to a builder tab or `#launch-publish`.
- **Status:** In progress (repair branch)

### KW-002: Production schema is not applied by deploy

- **Module:** Deployment / database
- **Severity:** P1
- **Description:** Cloud Run deploys Node from `master`. Staging receives `scripts/apply-staging-sql.mjs`. Production (`maidxfntfpnkcqnuhozo`) is explicitly **not** in that path. New RPCs (`create_sale` 10-arg, onboarding journey, WhatsApp complete-outbox, feature flags) can exist in git and staging while production still has older overloads. This is the same failure class as leftover `create_business_with_owner` signatures and “couldn’t load your shop”.
- **Root cause:** Deliberate safety rail (do not auto-migrate production) without a compensating **schema-diff gate**.
- **Affected files:** `scripts/apply-staging-sql.mjs`, `scripts/staging-manifest.mjs`, `.github/workflows/ci.yml`, `supabase/config.toml`, `CONTRIBUTING.md`
- **Proposed fix:** Read-only production schema probe (function signatures, readiness checks) that **fails the deploy job** when drift is detected. Do **not** auto-apply production SQL in this batch. Staging now probes unique `create_sale` `_tenders`, unique jsonb `create_business_with_owner`, and `setup_completed_at`.
- **Verification test:** `STAGING_READINESS_CHECKS` includes those ids. Production apply still needs a separate go-ahead.
- **Status:** In progress (repair branch) for staging probes; production apply still Open (ops)
- **DB change:** Probe only unless approved
- **External dependency:** Production Management API or SQL access (operator)

### KW-003: Repo-wide CI `cancel-in-progress` can cancel master deploy

- **Module:** CI
- **Severity:** P1
- **Description:** `.github/workflows/ci.yml` uses `concurrency.group: staging-ci-${{ github.repository }}` with `cancel-in-progress: true`. Any new PR or push cancels **every** in-flight CI run in the repo, including `master` after merge. GitHub history: PR #114’s master run was **cancelled**; #116 failed; only #115 later succeeded.
- **Root cause:** Shared concurrency key chosen for staging-SQL serialisation, applied to the whole workflow including deploy.
- **Affected files:** `.github/workflows/ci.yml`
- **Proposed fix:** Split groups: `ci-${{ github.workflow }}-${{ github.ref }}` for `check`/`e2e`; never cancel `master`/`main` deploy. Staging SQL stays CREATE OR REPLACE / IF NOT EXISTS (last-writer-wins).
- **Verification test:** Workflow YAML uses per-ref concurrency; `cancel-in-progress` is false on master/main.
- **Status:** In progress (repair branch)

### KW-004: CI can go green without staging SQL or integration tests

- **Module:** CI
- **Severity:** P1
- **Description:** `apply-staging-sql.mjs` exits 0 when `SUPABASE_ACCESS_TOKEN` is empty. `describeStaging` then skips 71 integration tests. `check` still passes and `deploy` can run. E2E is `continue-on-error: true`. `workflow_dispatch` on `deploy-cloud-run.yml` skips `needs: check` entirely.
- **Root cause:** Convenience defaults treated as success.
- **Affected files:** `scripts/apply-staging-sql.mjs`, `tests/integration/helpers.ts`, `.github/workflows/ci.yml`, `.github/workflows/deploy-cloud-run.yml`
- **Proposed fix:** On `master`/`main` push, missing token **fails** `check` (`REQUIRE_STAGING_SQL`). Keep skip-on-PR-from-fork. Manual Cloud Run dispatch remains break-glass.
- **Verification test:** `tests/staging-sql-gate.test.ts`, empty token + required flag → `fail`; PR without token → `skip`.
- **Status:** In progress (repair branch)

### KW-005: Mail/WhatsApp flush cron cannot parse the API response

- **Module:** Notifications
- **Severity:** P1
- **Description:** `POST /api/internal/flush-mail` returns `{ email, whatsapp }`. `.github/workflows/flush-mail.yml` does `format(**result)` looking for top-level `sent`, `failed`, `configured`. GitHub Actions for “Flush mail outbox” are **failing** (observed 3 Nov 2026 04:27 CAT and earlier). Even with Resend/WhatsApp secrets set, the scheduled sender can exit before operators trust delivery.
- **Root cause:** API shape changed when WhatsApp was added; workflow was not updated.
- **Affected files:** `.github/workflows/flush-mail.yml`, `src/routes/api.internal.flush-mail.ts`
- **Proposed fix:** Parse nested `{email,whatsapp}`; succeed if both sides are unconfigured (no-op) or sent; fail only on unauthorized / send failures. Do not mark rows sent in the parser.
- **Verification test:** Feed a fixture JSON through the same Python; unit-test the route shape.
- **Status:** In progress (repair branch)
- **External dependency:** `APP_URL` / `MAIL_FLUSH_SECRET` / Resend / WhatsApp Cloud still required for **actual** delivery (KW-016)

### KW-010: Google OAuth `next` is ignored after callback

- **Module:** Authentication
- **Severity:** P1
- **Description:** Sign-in builds `next=/dashboard` or `/onboarding`, but `auth_.callback` / `useFinishPkceCode` navigates via `getPostAuthDestination` only. Users can land on a different app than the button implied.
- **Root cause:** Two sources of truth (query vs database).
- **Affected files:** `src/routes/auth.tsx`, `src/lib/auth/google-oauth.ts`, `src/routes/auth_.callback.tsx`, `src/lib/auth/use-finish-pkce-code.ts`
- **Proposed fix:** Keep DB-derived destination as authority (safer than client `next`). Drop unused `next` or honour it only when it is a subset of the safe list **and** consistent with membership. Document the rule.
- **Verification test:** Existing `tests/google-oauth.test.ts` plus callback unit covering ignore-or-honour.
- **Status:** In progress (repair branch)

### KW-011: MFA recovery may block password update

- **Module:** Authentication
- **Severity:** P1
- **Description:** `updatePassword` uses `requireSupabaseAuth` without `allowAal1Session`. Enrolled users completing recovery at aal1 can be refused.
- **Root cause:** MFA gate copied onto a recovery endpoint.
- **Affected files:** `src/lib/auth.functions.ts` (or `src/lib/auth/…` + `auth.functions.ts` `updatePassword`), `src/lib/integrations` auth-middleware
- **Proposed fix:** Allow aal1 **only** on `updatePassword` after a recovery session; keep aal2 on the rest of the app.
- **Verification test:** Unit around middleware flags; staging MFA user if available.
- **Status:** In progress (repair branch)
- **Live proof:** UNVERIFIED

### KW-012: `get_my_permissions` failure becomes an empty grant set

- **Module:** Membership
- **Severity:** P1
- **Description:** `loadWorkspace` assigns `permissions: permissions ?? []` and does not `dbFail` on the RPC error. UI hides actions; server writes still enforce RPC permissions. Operators see a “broken empty shop” rather than an error.
- **Root cause:** Defensive default used for a security-sensitive list.
- **Affected files:** `src/lib/business.server.ts`
- **Proposed fix:** If the RPC errors and is not a skippable missing-function case, fail the workspace load (retry UI). If the function is missing, treat as skip + owner-all / fail-closed, pick one and test.
- **Verification test:** Mock RPC error → workspace error, not empty permissions.
- **Status:** In progress (repair branch)

### KW-013: Dual onboarding flags (`onboarding_completed` vs `setup_completed_at`)

- **Module:** Onboarding / auth routing
- **Severity:** P1
- **Description:** `create_business_with_owner` sets `onboarding_completed = true` immediately. `setup_completed_at` stays null until `/setup` skip or complete. `destinationAfterAuth` only reads the first flag → `/dashboard`, which then redirects to `/setup`. Legacy rows with `onboarding_completed = false` always go to `/onboarding` even if setup is done. Staff login always goes to `/dashboard`.
- **Root cause:** Journey rewrite added a second flag without updating post-auth.
- **Affected files:** `src/lib/auth/post-auth-destination.ts`, `src/lib/auth/oauth-callback.server.ts`, `src/routes/staff-login.tsx`, `src/routes/_authenticated/dashboard.tsx`, `supabase/migrations/20261103080000_onboarding_journey.sql`
- **Proposed fix:** Single function: no membership → onboarding; membership + no `setup_completed_at` → `/setup`; else `/dashboard`. Keep both columns; stop using them for different decisions. `/onboarding` `beforeLoad` redirects existing shops; workspace load errors never dump owners into create-shop.
- **Verification test:** `tests/post-auth-destination.test.ts` (`shouldSendToCreateShop`, `onboardingPageDestination`).
- **Status:** In progress (repair branch)

### KW-014: Financial reads are not permission-gated

- **Module:** Reports / expenses / staff
- **Severity:** P1
- **Description:** `getReports`, `listExpenses`, and `loadDashboard` do not `assertPermission('reports.financial')`. RLS “members read” allows any active member to SELECT `sales`, `expenses`, `payments`. Cashiers are denied in the UI only.
- **Root cause:** Permission matrix applied to writes and nav, not to read server functions.
- **Affected files:** `src/lib/business.server.ts`, `src/lib/business.functions.ts`, foundation RLS policies
- **Proposed fix:** `assertPermission` on those handlers. Do **not** drop member SELECT in this batch (POS still needs to read products/customers). Optional later: tighter SELECT policies.
- **Verification test:** Staging cashier JWT cannot call `getReports`.
- **Status:** In progress (repair branch)

### KW-015: Preview failures send users to `/onboarding`

- **Module:** Storefront
- **Severity:** P1
- **Description:** `decideStorePage` / store loader maps preview errors to `setup` → `/onboarding`, including wrong slug and anonymous users.
- **Root cause:** Reuse of merchant setup destination for all preview failures.
- **Affected files:** `src/lib/storefront/store-page.ts`, `src/routes/store.$slug.tsx`
- **Proposed fix:** Preview miss → Shop-not-live or 403 “you cannot preview this shop”, never `/onboarding` for anonymous.
- **Verification test:** Existing `tests/storefront.test.ts` cases.
- **Status:** In progress (repair branch)

### KW-016: Transactional email and WhatsApp Cloud unverified in production

- **Module:** Notifications
- **Severity:** P1
- **Description:** Outbox enqueue is real. Delivery needs `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, `MAIL_FLUSH_SECRET`, `WHATSAPP_CLOUD_*`, and a working flush (KW-005). `KNOWN_LIMITATIONS.md` already says unconfigured mail stays queued. Do not mark integrations connected.
- **Root cause:** Ops secrets + broken cron.
- **Affected files:** `src/lib/notifications.mail.server.ts`, `src/lib/notifications.whatsapp.server.ts`, deploy workflow
- **Proposed fix:** After KW-005, operator confirms admin health / a single staging send. No fake sent status.
- **Verification test:** Staging outbox row moves to `sent` with provider id.
- **Status:** Open (ops)
- **External dependency:** Resend domain, Meta WhatsApp Cloud (paid / review)

---

## P2: Medium

### KW-020: `create_sale` idempotency race

- **Module:** POS
- **Severity:** P2
- **Description:** Check-then-insert without advisory lock. Parallel submits with the same key: one insert, one unique-violation error (sale is **not** duplicated). UI may show failure after success.
- **Root cause:** Shop orders use advisory locks; POS does not.
- **Affected files:** `supabase/migrations/20261102160000_split_tenders.sql`
- **Proposed fix:** `pg_advisory_xact_lock` on `(business_id, idempotency_key)` before insert, matching shop orders.
- **Verification test:** Staging parallel RPC; one uuid returned twice or second call returns existing id.
- **Status:** Open
- **DB change:** `CREATE OR REPLACE` of `create_sale`, requires review of the full 10-arg body (do not drop tenders)

### KW-021: POS and inventory ignore location id

- **Module:** Inventory / POS
- **Severity:** P2
- **Description:** RPC accepts `_location_id`; Node `createSale` and inventory adjust omit it → default location only. Branch UI cannot move stock.
- **Root cause:** Locations shipped as schema-first.
- **Affected files:** `src/lib/business.server.ts`, `src/routes/_authenticated/sales.tsx`, `src/routes/_authenticated/inventory.tsx`
- **Proposed fix:** Pass active location from workspace; keep default if unset.
- **Verification test:** Sale at location B decrements `product_stock` for B.
- **Status:** Open

### KW-022: Reports hide tender rail and original currency

- **Module:** Reporting
- **Severity:** P2
- **Description:** `loadReports` groups `payments.method` only. Split-tender `rail`, `currency`, `amount_original` are stored and shown on the dashboard via `get_daily_takings`, not on Reports export.
- **Root cause:** Reports predates split tenders.
- **Affected files:** `src/lib/business.server.ts` `loadReports`, `src/routes/_authenticated/reports.tsx`
- **Proposed fix:** Add rail/currency breakdowns; still no silent USD+ZiG sum.
- **Verification test:** Unit on grouping helpers.
- **Status:** Open

### KW-023: `/setup` has no progress-error state

- **Module:** Onboarding
- **Severity:** P2
- **Description:** Failed `get_setup_progress` renders every checklist item as “to do”.
- **Affected files:** `src/routes/_authenticated/setup.tsx`
- **Proposed fix:** Retry + readable error (same pattern as dashboard workspace-error).
- **Verification test:** Component/unit on error branch.
- **Status:** In progress (repair branch)

### KW-024: Shop subdomain and custom domain ops gap

- **Module:** Storefront
- **Severity:** P2
- **Description:** App rewrites `{slug}.{host}`. Cloud Run domain map is apex/www. `*.mykwetuu.com` needs wildcard DNS/TLS. Custom domains are missing.
- **Affected files:** `src/lib/storefront/host.ts`, `.github/workflows/deploy-cloud-run.yml`, `docs/KNOWN_LIMITATIONS.md`
- **Proposed fix:** Keep `/store/{slug}` as the supported live URL until ops enables wildcard. Do not claim `shop.mykwetuu.com` is live.
- **Verification test:** Ops checklist, not a code claim.
- **Status:** Open (ops)
- **External dependency:** DNS/TLS (Cloudflare or HTTPS LB)

### KW-025: Marketplace directory can list a shop with zero products

- **Module:** Marketplace
- **Severity:** P2
- **Description:** Shop browse does not require a published listing; product cards do.
- **Affected files:** `browse_marketplace` SQL, `src/routes/stores.tsx`
- **Proposed fix:** Filter shops with at least one published listing **or** keep and document “opening soon”.
- **Status:** Open (product)

### KW-026: ESLint admin-import allowlist bypassed by dynamic import

- **Module:** Security hygiene
- **Severity:** P2
- **Description:** Mail/WhatsApp flush dynamically import `client.server`. `no-restricted-imports` does not see them.
- **Affected files:** `eslint.config.js`, `src/lib/notifications.mail.server.ts`, `src/lib/notifications.whatsapp.server.ts`
- **Proposed fix:** Static import + allowlist those two files (they already need admin for outbox claim).
- **Status:** Open

### KW-027: Authed rate limit fail-open

- **Module:** Security / reliability
- **Severity:** P2
- **Description:** Intentional after shop-load lockouts. If `check_rate_limit` is down, write APIs are unlimited (still auth’d). Webhooks stay fail-closed.
- **Affected files:** `src/lib/rate-limit.server.ts`
- **Proposed fix:** Keep fail-open for `getWorkspace` / reads; consider fail-closed for money writes once production RPC is guaranteed (depends on KW-002).
- **Status:** Open (product / ops)

### KW-028: Trial cannot operate POS when billing is enabled

- **Module:** Billing
- **Severity:** P2
- **Description:** `canOperateForSubscription` blocks trialing. Deploy currently sets `BILLING_ENABLED=false`, so production does **not** hit this. Enabling billing without a product decision will lock new shops out of POS.
- **Affected files:** `src/lib/billing-write.ts`
- **Proposed fix:** Product decision before turning billing on. Do not flip `BILLING_ENABLED` in this audit.
- **Status:** Open (product)

---

## P3: Low

### KW-030: Unused onboarding resume helpers

- **Module:** Onboarding
- **Severity:** P3
- **Description:** `resumeOnboardingShopStep` / localStorage helpers are only referenced by their own module and tests.
- **Affected files:** `src/lib/onboarding-resume.ts`
- **Proposed fix:** Wire them or delete in a later cleanup. Do not do this in a security batch.
- **Status:** Open

### KW-031: Deprecated `auth.role()` in older DEFINER functions

- **Module:** Database
- **Severity:** P3
- **Description:** Safe `<> 'service_role'` pattern. Future replace with JWT claims.
- **Status:** Informational

### KW-032: Admin SMS / legal-name placeholders

- **Module:** Admin / legal
- **Severity:** P3
- **Description:** Admin operations notes mention SMS as placeholder. `/privacy` and `/terms` still have operator legal-name slots.
- **Status:** Open (ops)

### KW-033: No product variants; no stock transfers

- **Module:** Catalogue / inventory
- **Severity:** P3 (as bugs) / **Missing features**
- **Description:** Documented gaps. Do not invent tables in a stability audit.
- **Status:** Open (product)

### KW-034: Multi-business switcher

- **Module:** Membership
- **Severity:** P3 (product), **MISSING**
- **Description:** SQL blocks a second membership. `loadWorkspace` would only show the oldest if data existed. Building a switcher requires a product decision to lift the one-shop rule.
- **Status:** Open (product)

### KW-035: CSP `unsafe-inline`

- **Module:** Security
- **Severity:** P3
- **Description:** Documented in `src/start.ts`. Session is httpOnly. Not a silent ignore, known tradeoff.
- **Status:** Informational

### KW-037: Service-commerce SQL not on staging manifest

- **Module:** Database / CI
- **Severity:** P1
- **Description:** Migrations `20261104010000_security_hardening.sql` and `20261104090000`–`20261104095000` (services, bookings, hybrid POS) exist in `supabase/migrations/` but are **not** in `scripts/staging-manifest.mjs`. CI staging apply will not create them. Merchant routes (`/services`, `/bookings`, public service booking) may 500 on staging.
- **Proposed fix:** Add manifest entries + `STAGING_READINESS_CHECKS` probes before advertising hybrid commerce.
- **Status:** Open
- **DB change:** Manifest only (SQL already authored)

### KW-038: Junk catalogue rows from imports / Quick Add

- **Module:** Inventory / Quick Add
- **Severity:** P1 (merchant UX)
- **Description:** SOH sheets and mixed files can create products named like totals, credits, or allergy footers. Master has smart Excel mapping (#137) but **no** junk filter or bulk archive. Open PRs #139 (intent + filter) and #140 (bulk delete + select likely junk).
- **Proposed fix:** Merge #140 then #139; help copy on inventory cleanup.
- **Status:** In progress (PRs #139–#140)

---

## Retired items (previous register)

| Old ID                                      | Outcome                                                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| ISS-001 implicit any on market/store routes | Types are present on current `market.tsx`. Not reopened unless `tsc` fails in repair CI.                       |
| ISS-002 “zero tests”                        | **False.** 67 unit + 18 integration + 2 e2e files exist.                                                       |
| ISS-003 dashboard `/setup` redirect         | **Implemented** in `dashboard.tsx` `beforeLoad` + client effect.                                               |
| ISS-004 Resend config                       | Folded into KW-016.                                                                                            |
| ISS-005 `auth.role()`                       | KW-031.                                                                                                        |
| ISS-006 console.error density               | Not an issue.                                                                                                  |
| ISS-007 trial POS block                     | KW-028.                                                                                                        |
| ISS-008 journey SQL not on staging          | Manifest **always** applies `20261103080000_onboarding_journey.sql`. Staging apply still unverified this pass. |

---

## Summary counts

| Severity       | Count  | IDs                                       |
| -------------- | ------ | ----------------------------------------- |
| P0             | 1      | KW-001 (**Mitigated** in git; verify RPC) |
| P1             | 14     | KW-002–KW-005, KW-010–KW-016, KW-037–038 |
| P2             | 9      | KW-020–KW-028                             |
| P3             | 6      | KW-030–KW-035                             |
| **Open total** | **30** |                                           |

Cross-tenant **write** isolation was not shown broken in code review. KW-001 cross-tenant **read** is mitigated in application code and member SQL on manifest; confirm with staging RPC probe before closing.
