# Test strategy

## Layers

| Layer                                                             | Where                | Runs in CI                            | Needs secrets                       |
| ----------------------------------------------------------------- | -------------------- | ------------------------------------- | ----------------------------------- |
| Unit                                                              | `tests/*.test.ts`    | Yes                                   | No                                  |
| Integration (RLS, billing, rate limit, permissions, transactions) | `tests/integration/` | Yes if `SUPABASE_ACCESS_TOKEN` is set | Staging Management API token        |
| Typecheck                                                         | `tsc --noEmit`       | Yes                                   | No                                  |
| Lint                                                              | `eslint .`           | Yes                                   | No                                  |
| Production build                                                  | `vite build`         | Yes                                   | Staging `VITE_*` / `SESSION_SECRET` |

There is no Playwright/Cypress suite. Browser, VoiceOver, and airplane-mode POS tests are manual and mostly unverified.

## Required failure cases vs coverage

| Case                             | Coverage                                     |
| -------------------------------- | -------------------------------------------- |
| Cross-tenant read/write          | Integration, now including storefront tables |
| Paynow confirm grant leak        | Integration                                  |
| Duplicate sale / stock race      | Integration transactional tests (existing)   |
| Offline queue order and oversell | Unit this stage                              |
| Shop host rewrite                | Unit `tests/storefront.test.ts`              |
| Session cookie Secure flag       | Unit this stage                              |
| Empty DB public shop             | RPC returns null; no e2e here                |
| Payment webhook hash fail        | Code path; not replayed this session         |
| Service worker isolation         | Code change; not browser-tested here         |

## Dedicated data

Integration tests create throwaway users on staging and delete them. They must never use production.

## Devices

Supported in practice: current Chrome and Safari on desktop/mobile. Unsupported list has not been published to customers.
