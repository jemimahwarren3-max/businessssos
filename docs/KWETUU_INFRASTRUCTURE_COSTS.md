# Kwetuu infrastructure costs

Exact provider invoices are **not** in the app. Do not treat the $7 launch-fee example as a forecast.

## Known cost drivers (current deploy)

| Item | Current default | Cost note |
|------|-----------------|-----------|
| Cloud Run | 1 CPU, 512Mi, min 0, max 3, timeout 60s | Scale-to-zero when idle; max 3 caps spend |
| Supabase | Staging + optional production project | Free-tier backup is GitHub `pg_dump`, not PITR |
| Resend | Optional | Flush cron every 10 min even if empty |
| Groq / Gemini | Optional | Daily caps; kill switch |
| Upstash Redis | Optional | Fail-open if unset |
| Sentry | Optional DSNs | `tracesSampleRate: 0` |
| Paynow | Optional | Billing env is **off** until you flip `BILLING_ENABLED` |

## Unit economics (policy, not code)

A one-time ~$7 launch fee **cannot** fund unlimited hosting + AI. Platform subscription (`BILLING_ENABLED` + `platform_runtime.billing_enforced`) is the planned ongoing charge. Measure cost per shop from **provider invoices**, then enter them operationally. Admin health does **not** invent $0.50/shop allocations.

## What to add later

Import or paste monthly Cloud / Supabase / Resend / Groq totals into an admin ledger. Until then, use provider dashboards.
