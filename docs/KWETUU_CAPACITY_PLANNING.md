# Kwetuu capacity planning

## Hard limits (as deployed)

| Resource | Limit |
|----------|--------|
| Cloud Run instances | 0–3 |
| Cloud Run memory | 512 MiB |
| Cloud Run request timeout | 60 s |
| Postgres `anon`/`authenticated` statement timeout | 3 s |
| Marketplace browse | 180/min **global** key |
| Store checkout RPC | 20/min per slug |
| Public shop HTTP | 60/min IP (Node) |

Raising Cloud Run `--max-instances` increases the **cost ceiling**. Do it after `scripts/load-test.mjs` on staging.

## Progressive path

1. Cache + fewer RPCs (this slice).
2. Cloudflare cache for public shops when DNS is ready.
3. Upstash if workspace cache miss rate hurts.
4. Raise instances or memory when p95/errors prove saturation.
5. pgmq workers only if GitHub flush/cron is the bottleneck.

## Offline POS

Pending sales live in IndexedDB. Sync is idempotent. Offline is **not** extra Cloud Run capacity — it is a queue that hits `create_sale` later.

## Acceptance

Report **tested** VU count, environment, bottleneck, and remaining limits. Never claim “unlimited traffic.”
