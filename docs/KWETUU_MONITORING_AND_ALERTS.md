# Kwetuu monitoring and alerts

## In production today

| Signal | Where |
|--------|--------|
| Errors | Sentry (`VITE_SENTRY_DSN`, `VITE_SENTRY_DSN_BACKEND`) if secrets set |
| Env presence | Admin → Ops health (no secret values) |
| Mail flush / backup / invoices | GitHub Actions (often red until secrets/RPC match) |
| Cloud Run | GCP console, revisions, request count, CPU |

## Not wired

Grafana, OTEL export, synthetic uptime, queue-depth charts, cost-per-business alerts.

## Logging rules

Do not log session cookies, service role keys, Paynow keys, or `MAIL_FLUSH_SECRET`. Sentry should stay at `tracesSampleRate: 0` until you accept the quota cost.

## When to alert (operator)

- Cloud Run 5xx spike
- Flush mail `claim` errors
- Backup password failure
- Recurring invoices 401
- AI provider 429 / budget

## Known Sentry issues (triage log)

Use **release** on each event (set via `VITE_SENTRY_RELEASE` at Docker build) to confirm a fix landed in production.

| Short id | Symptom | Cause | Fix | Status |
|----------|---------|-------|-----|--------|
| KWETUU-BACKEND-1 | Workspace load 500 for support impersonation | `supabaseAdmin.rpc` lost `this` when passed through a wrapper | `82c72c9` `impersonation.server.ts` | On `master` (deploy to confirm volume drops) |
| KWETUU-FRONTEND-3 / -5 | Public shop "data could not be read" | `publicStoreSchema` rejected `null` text columns | `8422504` `.catch("")` on store text fields; prefer `.nullish().catch("")` | On `master` |
| (unscoped) | Online orders error page, `e.filter is not a function` | React Query key `["storefront", businessId]` shared between admin store object and orders list | Separate key `storefront-orders`, array guards (`order-desk.ts`, `loadStoreOrders`) | **PR #130** until merged |

### Operator API access (optional)

Cloud agents cannot read the Sentry API without a team token. To enable automated triage, add a **read-only** org auth token as `SENTRY_AUTH_TOKEN` in Cursor secrets (not in the client bundle). Issues live under the Kwetuu frontend and backend projects tied to the deploy DSNs.
