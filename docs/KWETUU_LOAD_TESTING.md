# Kwetuu load testing

**Never run destructive tests against production.** Use staging or localhost.

## Tools in repo

| Tool | Command | Scope |
|------|---------|--------|
| Autocannon wrapper | `node scripts/load-test.mjs [origin]` | `/`, `/market`, `/auth`, `/health` — 20 conn, 15s |
| k6 smoke | `k6 run -e BASE_URL=http://localhost:8080 scripts/k6-storefront.js` | 20 VUs, 30s, public pages |
| Playwright | `npm run test:e2e` | Functional, not capacity |

## Staged targets (tests, not SLAs)

| Stage | Concurrent VUs | Goal |
|-------|----------------|------|
| 1 | 100 | Baseline public browse |
| 2 | 500 | Raise only after Stage 1 p95 + errors are known |
| 3–5 | 1k–10k | Staging only; watch Postgres connections |

Engineering targets to **validate**, not promise: p95 &lt; 500 ms cached public HTML; p95 &lt; 1 s typical DB-backed read. Exclude Paynow and AI.

## Must test separately

Checkout, inventory decrement, and POS sync. Cached browse ≠ 10k simultaneous checkouts.

## Not run in CI

Load tests are operator-triggered. CI e2e-smoke is functional and currently flakes on `/market` shop links.
