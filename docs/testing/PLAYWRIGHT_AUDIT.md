# Playwright E2E Audit

## 1. Project Structure

| Aspect | Detail |
|--------|--------|
| Framework | Vite 8 + React 19 + TanStack Start/Router (SSR via Nitro) |
| Package manager | npm (lockfile present) |
| Node requirement | >= 22.12.0 |
| Database | Supabase (PostgreSQL + Auth + Storage + RLS) |
| Staging project | `slajanbsfqjnuuiohbmg` |
| Production project | `maidxfntfpnkcqnuhozo` |
| Deploy target | Google Cloud Run (auto-deploys from master) |
| Live URL | https://mykwetuu.com |

## 2. Existing Test Infrastructure

### Vitest (unit + integration)
- **83 test files** (65 unit in `tests/`, 18 integration in `tests/integration/`)
- **6,073 lines** of test code
- Config: `vitest.config.ts`, sequential file execution, 20s timeout, `@` path alias
- Integration tests talk to staging Supabase via Management API (need `SUPABASE_ACCESS_TOKEN`)
- Coverage: billing gates, format utilities, input sanitization, onboarding schemas, storefront logic, tenant isolation, payment safety, permissions, rate limiting, transactional business creation

### Playwright (E2E)
- **Already installed**: `@playwright/test ^1.55.1` in devDependencies
- **Config**: `e2e/playwright.config.ts`
- **3 spec files** (2 suites, ~60 lines total):
  - `smoke.spec.ts` — 4 tests: home, marketplace, auth page, staff-login page load
  - `market-journey.spec.ts` — 1 test: browse marketplace and open a shop
- **Run command**: `npm run test:e2e`
- **Current setup**:
  - Chromium only (Desktop Chrome)
  - `E2E_BASE_URL` defaults to `https://mykwetuu.com`
  - Trace on first retry, screenshot on failure
  - 60s timeout
  - No authentication fixtures
  - No mobile or multi-browser projects
  - No video recording
  - Read-only tests only (no mutations)

### CI/CD (GitHub Actions)
- `ci.yml` runs on push to master/main and PRs:
  1. Type-check, lint, dependency audit
  2. Apply staging SQL migrations
  3. Staging readiness check
  4. Vitest run (with `SUPABASE_ACCESS_TOKEN`)
  5. Build
- `e2e-smoke` job: runs after `check`, installs Chromium, runs Playwright against mykwetuu.com
  - `continue-on-error: true` — smoke failures don't block deploy
- `deploy` job: runs on master push after `check` passes

## 3. Authentication Model

| Flow | Path | Method |
|------|------|--------|
| Owner/admin sign-up | `/signup` or `/auth?mode=signup` | Email+password or Google OAuth |
| Owner/admin sign-in | `/auth?mode=signin` | Email+password or Google OAuth |
| Staff sign-in | `/staff-login` | Two-stage: business name + shop password, then staff name + PIN |
| Password recovery | `/auth` (reset tab) + `/auth/recover` | Email link via Supabase GoTrue |
| OAuth callback | `/auth/callback` | PKCE code exchange |
| Email confirm | `/auth/confirm` | Token hash verification |
| MFA | Authenticated gate | TOTP challenge if enrolled (aal2) |
| Session | httpOnly cookie | Client-side check in `_authenticated/route.tsx` |

**Key detail**: Auth gate is client-side only (`ssr: false`) — server-side beforeLoad caused redirect loops with OAuth. All `_authenticated/*` routes require a valid session.

## 4. Route Inventory

### Public routes (no auth)
`/`, `/about`, `/features`, `/pricing`, `/faq`, `/auth`, `/signup`, `/login`, `/staff-login`, `/reset-password`, `/auth/callback`, `/auth/confirm`, `/auth/recover`, `/market`, `/market/carts`, `/stores`, `/templates`, `/store/$slug/*` (storefront), `/invite/$token`, `/legal/*`, `/privacy`, `/terms`

### Protected routes (require auth)
`/onboarding`, `/setup`, `/dashboard`, `/inventory`, `/sales`, `/sale-history`, `/customers`, `/invoices`, `/quotes`, `/recurring-invoices`, `/expenses`, `/suppliers`, `/purchase-orders`, `/cash-drawer`, `/lay-by`, `/online-orders`, `/commission`, `/time-clock`, `/insights`, `/reports`, `/growth`, `/branches`, `/storefront`, `/assistant`, `/notifications`, `/help`, `/settings.*` (account, billing, payments, team, data, audit-log)

### Admin routes
`/admin/*` (index, health, businesses, billing, communications, integrations, operations, orders, stores, system, audit, personalize) — platform owner only, enforced server-side

## 5. Business Roles

| Role | Capabilities |
|------|-------------|
| `owner` | Full access, billing, team management, business deletion |
| `admin` | Most features except billing owner-only actions |
| `manager` | Operations, limited settings |
| `cashier` | POS, sales, limited inventory |
| `accountant` | Financial views, invoices, expenses |

Enforced via `has_business_role` RPC + `assertRole` server function + `business_role_permissions` table + RLS policies.

## 6. Database Schema Highlights

- **87 migrations** covering the full schema
- Core tables: `businesses`, `business_members`, `business_settings`, `products`, `sales`, `sale_items`, `customers`, `invoices`, `expenses`, `suppliers`, `purchase_orders`, `subscriptions`, `locations`, `stock_movements`, `cash_drawers`, `notifications`, `storefront_orders`, `storefront_reviews`
- RLS on all public-schema tables
- Security-definer functions for privileged operations (business creation, billing, admin)
- `create_business_with_owner` RPC: creates business + membership + settings + subscription in one transaction

## 7. Payment Systems

| System | Purpose | Provider |
|--------|---------|----------|
| Subscription billing | Business subscriptions ($7/mo) | Paynow (USD + ZiG) |
| Storefront checkout | Customer payments to shops | Paynow (shop credentials) |
| Manual payments | Offline order confirmation | Internal ledger |
| Split tenders | Multiple payment methods per sale | Internal |

Paynow integration uses sandbox for testing. Webhook endpoint exists for payment status updates.

## 8. What Is Already Testable

- **Public pages**: All load without auth (proven by existing smoke tests)
- **Marketplace browsing**: Shop listing and product discovery
- **Auth page rendering**: Sign-in/sign-up form display
- **Staff login rendering**: Two-stage form display

## 9. What Is Missing

### Authentication fixtures
No reusable authenticated state. Every test that needs a logged-in user would need to sign in from scratch. Need:
- Shared auth state file (Playwright `storageState`)
- Test accounts on staging (email+password, not OAuth-dependent)
- Separate owner and staff test accounts

### Browser coverage
Only Chromium. Need Firefox and WebKit for cross-browser confidence. Mobile viewports not tested.

### Mutation tests
Zero tests that create, update or delete data. The entire business workflow (onboarding, products, sales, orders, storefront) is untested at the E2E level.

### Failure and recovery tests
No network interruption, slow response, or concurrent operation tests.

### Multi-tenant isolation at E2E level
Integration tests cover this via direct DB queries, but no browser-level verification that Business A's UI cannot access Business B's data.

### Test data isolation
No test data seeding or cleanup strategy. Tests against mykwetuu.com use production data — need dedicated test accounts with known state.

## 10. What Needs Fixing Before Automated Testing Can Be Trusted

1. **Test accounts**: Create dedicated test user accounts on staging with known credentials (not production). Store credentials as CI secrets, never in code.

2. **Auth state reuse**: Implement Playwright `globalSetup` that authenticates once and saves `storageState` for all tests to reuse.

3. **Data isolation**: Tests that create data (products, sales, orders) need either:
   - A dedicated test business that gets cleaned up after each run, or
   - Idempotent test data that won't pollute real usage

4. **E2E base URL**: For mutation tests, point at a staging URL (not production). Read-only smoke tests can stay on production.

5. **CI smoke gate**: The `e2e-smoke` job currently has `continue-on-error: true`. Critical E2E failures should eventually block deploys.
