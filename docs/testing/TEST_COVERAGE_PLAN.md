# Playwright Test Coverage Plan

## Prerequisites (before any new test suites)

### P0: Test accounts on staging
Create two dedicated test accounts on staging Supabase (`slajanbsfqjnuuiohbmg`):
- **Test Owner A**: `e2e-owner-a@test.kwetuu.local`, owns "E2E Test Shop A"
- **Test Owner B**: `e2e-owner-b@test.kwetuu.local`, owns "E2E Test Shop B"
- **Test Staff**: staff member of Shop A with cashier role + PIN

Credentials stored as GitHub Actions secrets (`E2E_OWNER_A_EMAIL`, `E2E_OWNER_A_PASSWORD`, etc.). Never committed to code.

### P1: Auth fixtures and global setup
- `e2e/auth.setup.ts`, Playwright global setup that signs in test accounts via Supabase auth API and saves `storageState` to `e2e/.auth/`
- `e2e/fixtures.ts`, custom test fixtures exposing `ownerAPage`, `ownerBPage`, `staffPage` with pre-authenticated state
- `.gitignore` entry for `e2e/.auth/`

### P2: Playwright config upgrade
- Add Firefox and WebKit projects
- Add mobile viewport project (iPhone 14)
- Add video recording on failure
- Separate projects for smoke (production) vs full (staging)
- Set `E2E_BASE_URL` to staging for mutation tests

---

## Phase 3: Authentication and Onboarding

| # | Test | Status | Notes |
|---|------|--------|-------|
| 3.1 | Login with valid email+password | NEW | Use test owner A credentials |
| 3.2 | Login with invalid credentials | NEW | Verify error message, no redirect |
| 3.3 | Logout | NEW | Verify redirect to public page |
| 3.4 | Session persistence after refresh | NEW | Login, refresh, verify still authenticated |
| 3.5 | Protected route redirect | NEW | Visit /dashboard unauthenticated, verify redirect to /auth |
| 3.6 | Password recovery flow | NEW | Trigger reset email (verify form, not delivery) |
| 3.7 | Staff two-stage login | NEW | Business name + password, then staff name + PIN |
| 3.8 | Business creation (management path) | NEW | Full 6-step onboarding, verify redirect to /setup |
| 3.9 | Business creation (full path) | NEW | 6-step onboarding with store step, verify redirect to /setup |
| 3.10 | Setup workspace | NEW | Verify checklist renders, skip button works |

**Not testable automatically**: Google OAuth (requires real Google session), email confirmation (requires mailbox access), MFA TOTP (requires authenticator app). Mark as NOT ASSESSED.

**Existing coverage**: Account registration is partially covered by integration test `transactional.test.ts` (RPC level). Multi-business is not applicable (one business per login, see memory).

---

## Phase 4: Core Business Workflows

### Products (inventory)
| # | Test | Status | Notes |
|---|------|--------|-------|
| 4.1 | Create product | NEW | Navigate to /inventory, add product with name/price/stock |
| 4.2 | Edit product | NEW | Change price, verify update persists |
| 4.3 | Delete product | NEW | Delete, verify removed from list |
| 4.4 | Stock adjustment | NEW | Manual stock adjustment, verify new count |

**Existing coverage**: Product schema validation (unit), product category RPC (integration).

### POS (sales)
| # | Test | Status | Notes |
|---|------|--------|-------|
| 4.5 | Add items to cart | NEW | Navigate to /sales, add products |
| 4.6 | Complete a sale | NEW | Add items, select payment method, complete |
| 4.7 | Sale appears in history | NEW | After sale, verify in /sale-history |
| 4.8 | Stock deducted after sale | NEW | Check product stock decremented |

**Existing coverage**: Sale creation (integration), split tenders (integration), billing gates (unit).

### Customers
| # | Test | Status | Notes |
|---|------|--------|-------|
| 4.9 | Create customer | NEW | Navigate to /customers, add customer |
| 4.10 | Edit customer | NEW | Update details, verify persistence |

---

## Phase 5: Ecommerce

| # | Test | Status | Notes |
|---|------|--------|-------|
| 5.1 | Store page loads | EXISTS | `market-journey.spec.ts` covers browse |
| 5.2 | Product browsing | NEW | Navigate store, view product detail |
| 5.3 | Add to cart | NEW | Add product, verify cart badge/count |
| 5.4 | Cart page | NEW | View cart, adjust quantity, remove item |
| 5.5 | Checkout form | NEW | Fill shipping/billing, verify form validation |
| 5.6 | Preview mode safety | NEW | Verify store preview doesn't create orders |
| 5.7 | Store publication toggle | NEW | Enable/disable storefront, verify public visibility |

**Existing coverage**: Storefront RPC security (integration), order notification (integration), marketplace browse (E2E smoke).

---

## Phase 6: Subscriptions and Payments

| # | Test | Status | Notes |
|---|------|--------|-------|
| 6.1 | Subscription page renders | NEW | Navigate /settings/billing, verify plan display |
| 6.2 | Payment initiation | NEW | Click subscribe, verify Paynow redirect/iframe |
| 6.3 | Access restrictions when expired | NEW | Verify write-locked state when trial expires |
| 6.4 | Billing gates | EXISTS (unit) | `billing-write.test.ts` covers all gate functions |

**Not testable at E2E level without Paynow sandbox**: Successful payment verification, webhook processing, duplicate webhooks. These are covered by integration tests. Mark as NOT ASSESSED for E2E.

---

## Phase 7: Security and Multi-Tenant

| # | Test | Status | Notes |
|---|------|--------|-------|
| 7.1 | Business A cannot see Business B's products | NEW | Login as owner B, navigate, verify no A data |
| 7.2 | Unauthenticated dashboard access blocked | NEW | Verify redirect |
| 7.3 | Staff cannot access owner-only settings | NEW | Login as staff, verify billing/team settings hidden or blocked |
| 7.4 | Admin routes enforce permissions | NEW | Non-admin user hits /admin, verify blocked |

**Existing coverage**: Tenant isolation (18 integration test cases), permissions (integration), platform owner security (integration), payment safety (integration). RLS verified at DB level.

---

## Phase 8: Failure and Recovery

| # | Test | Status | Notes |
|---|------|--------|-------|
| 8.1 | Double-click submit prevention | NEW | Click create/save twice rapidly, verify no duplicate |
| 8.2 | Refresh during form | NEW | Fill form, refresh, verify UX (no crash) |
| 8.3 | Network offline banner | NEW | Route intercept to simulate offline, verify graceful handling |
| 8.4 | Expired session redirect | NEW | Clear auth cookie, navigate, verify redirect to /auth |

---

## Implementation Priority

### Wave 1 (Prerequisites + Auth): do first
1. Create test accounts on staging
2. Build auth fixtures (`auth.setup.ts`, `fixtures.ts`)
3. Upgrade Playwright config (multi-browser, mobile, staging URL)
4. Phase 3 tests (auth + onboarding)

### Wave 2 (Core Business)
5. Phase 4 tests (products, POS, customers)
6. Phase 7.1-7.2 (tenant isolation at browser level)

### Wave 3 (Ecommerce + Polish)
7. Phase 5 tests (storefront, cart, checkout)
8. Phase 8 tests (failure/recovery)
9. Phase 6 tests (subscription UI)

### Wave 4 (CI Integration)
10. Phase 7.3-7.4 (role enforcement)
11. Update CI to run E2E on staging after deploy
12. Remove `continue-on-error` from critical smoke tests

---

## Test Counts

| Phase | New E2E tests | Existing (E2E) | Existing (unit/integration) | Not assessable |
|-------|--------------|----------------|---------------------------|----------------|
| 3. Auth/Onboarding | 10 | 0 | 1 (transactional) | 3 (OAuth, email confirm, MFA) |
| 4. Business Workflows | 10 | 0 | 4 (sales, billing, products) | 0 |
| 5. Ecommerce | 6 | 1 (market browse) | 3 (storefront, orders) | 0 |
| 6. Subscriptions | 3 | 0 | 1 (billing gates) | 3 (Paynow sandbox) |
| 7. Security | 4 | 0 | 4 (tenant, permissions, platform) | 0 |
| 8. Failure/Recovery | 4 | 0 | 0 | 0 |
| **Total** | **37** | **1** | **13** | **6** |

---

## Reporting

After each wave, generate:
- `docs/testing/PLAYWRIGHT_TEST_REPORT.md`, full results with PASS/FAIL/NOT ASSESSED
- `docs/testing/FAILED_TESTS.md`, failures with screenshots, traces, and root cause
- `docs/testing/REGRESSION_COVERAGE.md`, what regressions each test prevents
