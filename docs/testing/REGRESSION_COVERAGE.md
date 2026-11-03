# Regression Coverage Matrix

**Last updated:** 2026-11-03

## Route Coverage

| Route | Unauthenticated | Authenticated | Notes |
|-------|:-:|:-:|-------|
| `/` (home) | smoke | - | |
| `/auth` | auth (7 tests) | - | signin, signup, reset, redirects |
| `/staff-login` | auth, smoke | - | Two-stage form |
| `/market` | storefront, smoke, resilience | - | Search, empty state |
| `/stores` | storefront | - | Directory listing |
| `/stores/:slug` | storefront | - | 404 for non-existent |
| `/stores/:slug/cart` | storefront | - | Empty cart |
| `/dashboard` | security (redirect) | authenticated | Session, logout |
| `/inventory` | security (redirect) | business-workflows | Page load, add-product form |
| `/sales` | security (redirect) | business-workflows | POS interface |
| `/sale-history` | security (redirect) | business-workflows | History listing |
| `/cash-drawer` | - | business-workflows | Drawer/float page |
| `/customers` | security (redirect) | business-workflows | Customer listing |
| `/expenses` | security (redirect) | business-workflows | Expense listing |
| `/invoices` | security (redirect) | business-workflows | Invoice listing |
| `/reports` | security (redirect) | business-workflows | Reports page |
| `/settings/billing` | security (redirect) | subscription | Plan/trial info |
| `/settings/account` | - | business-workflows | Profile/email |
| `/settings/team` | security (redirect) | business-workflows | Team members |
| `/admin` | security (not-found) | - | |
| `/health` | security (200) | - | API endpoint |
| `/*` (404) | resilience | - | Not-found page |

## Feature Coverage

| Feature | Tests | Category |
|---------|-------|----------|
| Email/password login | 2 | auth |
| Signup form | 1 | auth |
| Password reset | 1 | auth |
| Staff two-stage login | 1 | auth |
| Auth redirect (9 routes) | 9 | security |
| Session persistence | 1 | authenticated |
| Logout | 1 | authenticated |
| Product management (view + form) | 2 | business-workflows |
| POS / sales | 2 | business-workflows |
| Cash drawer | 1 | business-workflows |
| Customer management | 1 | business-workflows |
| Expenses | 1 | business-workflows |
| Invoices | 1 | business-workflows |
| Reports | 1 | business-workflows |
| Settings (account + team) | 2 | business-workflows |
| Billing/subscription | 2 | subscription |
| Marketplace browsing | 3 | storefront |
| Store pages | 2 | storefront |
| Cart | 1 | storefront |
| Error recovery | 4 | resilience |

## Not Yet Covered

| Feature | Priority | Reason |
|---------|----------|--------|
| Product creation (submit) | Medium | Needs isolated test data / cleanup |
| Sale completion (submit) | Medium | Needs products + payment method setup |
| Invoice creation | Medium | Depends on customer + product data |
| Storefront toggle | Low | Requires business with storefront disabled |
| Paynow payment flow | Low | External service, sandbox needed |
| MFA enrollment | Low | Requires TOTP setup |
| Google OAuth | Low | External provider, can't automate |
| File upload (product images) | Low | Needs storage bucket access |
| Multi-role testing | Medium | Needs staff accounts with different roles |
