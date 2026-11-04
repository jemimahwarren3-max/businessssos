# Playwright E2E Test Report

**Generated:** 2026-11-03
**Framework:** Playwright ^1.55.1
**Browsers:** Chromium, Firefox, WebKit, Mobile (iPhone 14)

## Summary

| Metric | Value |
|--------|-------|
| Total spec files | 10 |
| Total tests | 49 (40 unique + 9 loop-generated route checks) |
| Unauthenticated (always run) | 30 |
| Authenticated (require credentials) | 19 |
| Smoke subset | 4 |

## Spec Files

### auth.spec.ts (7 tests)
- Login form renders
- Invalid credentials show error
- Signup form renders
- Password reset form renders
- Dashboard redirect to /auth
- Inventory redirect to /auth
- Staff login two-stage form

### authenticated.spec.ts (3 tests, requires credentials)
- Session persists after refresh
- Logout redirects to public page
- Dashboard or setup loads after login

### business-workflows.spec.ts (11 tests, requires credentials)
- Inventory page loads
- Can open and fill add-product form
- Sales page loads with POS interface
- Sale history page loads
- Cash drawer page loads
- Customers page loads
- Expenses page loads
- Invoices page loads
- Reports page loads
- Settings account page loads
- Team settings page loads

### market-journey.spec.ts (1 test)
- Browse market and open a listed shop

### resilience.spec.ts (4 tests)
- Refresh auth page doesn't crash
- Non-existent route shows not-found
- No-results search handled gracefully
- Double-click sign-in doesn't cause error

### security.spec.ts (11 tests)
- 9 protected routes redirect to /auth when unauthenticated
- Admin returns not-found for non-admin
- Health endpoint returns 200

### smoke.spec.ts (4 tests)
- Home page loads
- Marketplace loads
- Auth page loads
- Staff login page loads

### storefront.spec.ts (5 tests)
- Marketplace loads with shops heading
- Stores directory loads
- Non-existent store returns 404
- Browse a listed shop
- Empty cart page

### subscription.spec.ts (2 tests, requires credentials)
- Billing settings page loads
- Billing page shows plan/trial info

## Browser Coverage

| Project | Browsers | Auth | Purpose |
|---------|----------|------|---------|
| smoke | Chromium | No | Production read-only sanity |
| chromium | Chromium | Yes | Full authenticated suite |
| firefox | Firefox | Yes | Cross-browser compat |
| webkit | WebKit | Yes | Safari/iOS compat |
| mobile | iPhone 14 viewport | Yes | Responsive layout |

## CI Integration

- **Smoke tests** run against production (`mykwetuu.com`), read-only
- **Full E2E** runs against staging with `E2E_OWNER_EMAIL` / `E2E_OWNER_PASSWORD` secrets
- Reports uploaded as artifacts (14-day retention)
- `continue-on-error: true` on e2e-smoke job (Phase 10: remove once stable)

## Known Limitations

1. Tests that require credentials are skipped in local dev without env vars
2. Product creation test fills the form but does not submit (avoids polluting data)
3. Market journey tolerates 404 on listed shops (data quality issue, not test failure)
4. SSR is off (`ssr: false`), so client-side hydration adds 5-15s to first page load in tests
