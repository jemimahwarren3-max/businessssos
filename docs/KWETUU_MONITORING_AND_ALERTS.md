# Kwetuu monitoring and alerts

## In production today

| Signal | Where |
|--------|--------|
| Errors | Sentry (`VITE_SENTRY_DSN`, `VITE_SENTRY_DSN_BACKEND`) if secrets set |
| Env presence | Admin → Ops health (no secret values) |
| Mail flush / backup / invoices | GitHub Actions (often red until secrets/RPC match) |
| Cloud Run | GCP console — revisions, request count, CPU |

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
