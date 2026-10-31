# Kwetuu scalability architecture

**Status:** Stage 1 audit + first low-cost code changes (Oct 2026).  
**Not a claim of unlimited capacity.** Cloud Run is capped at 3 instances / 512Mi unless you raise it.

## Current stack

```
Browser / PWA / POS
        │
Cloud Run (kwetuu, europe-west1, 0–3 instances)
        │
Supabase PostgREST + Postgres (RLS, RPCs, check_rate_limit)
        │
Optional: Upstash Redis, Resend, Groq/Gemini, Paynow, Sentry
```

There is **no** application-level CDN in git. Apex `mykwetuu.com` is a Cloud Run domain mapping. Wildcard shop hosts need operator DNS + TLS (Cloudflare on `*` is recommended when traffic justifies it).

## Six principles (how they map today)

| Principle | Today |
|-----------|--------|
| Cache public reads | Short `Cache-Control` on marketplace/shop HTML (`src/lib/http-cache.ts`). Redis for workspace + weekly AI report. No edge cache until Cloudflare. |
| Avoid extra backend work | Product page no longer double-fetches `get_public_store`. Dashboard AI briefing is **on demand**. |
| Async non-critical work | `notification_outbox` + GitHub flush cron. No pgmq yet. |
| Scale with demand | Cloud Run min 0 / max 3. Not autoscaled beyond that. |
| Control AI spend | Daily Postgres buckets, `AI_DISABLED` kill switch, defaults in `limits.server.ts`. |
| Per-business isolation | RLS + `assert_business_can_operate`. No per-tenant storage/API cost ledger yet. |

## What we will not add until measured

Paid Redis beyond a free Upstash trial, pgmq workers, extra microservices, Grafana, or raising Cloud Run max instances **without** a staging load test (`scripts/load-test.mjs`, `scripts/k6-storefront.js`).

## Related docs

`KWETUU_AI_COST_POLICY.md`, `KWETUU_BACKEND_OPTIMISATION.md`, `KWETUU_LOAD_TESTING.md`, `KWETUU_INFRASTRUCTURE_COSTS.md`, `KWETUU_MONITORING_AND_ALERTS.md`, `KWETUU_CAPACITY_PLANNING.md`, `CACHE_STRATEGY.md`.
