# Kwetuu backend optimisation

## Request path

Merchant UI talks to TanStack server functions. Those use the **service role** after session + permission checks. Shoppers hit PostgREST RPCs (`get_public_store`, `quote_store_cart`, `create_store_order`) with IP/slug rate limits.

## Changes in this slice

1. **Public `Cache-Control`** on `/`, `/market`, shop home, product pages (`src/start.ts`). Cart, checkout, orders, accounts stay uncached.
2. **One** `get_public_store` on product SSR (parent layout already loaded the shop).
3. Rate limit Node wrapper is **fail-closed** (`src/lib/rate-limit.server.ts`).

## Database

- Statement timeout 3s for `anon` / `authenticated`.
- Indexes exist for storefront, outbox, marketplace (see migrations `*perf*` and storefront files).
- App uses HTTP to Supabase, not a direct `pg` pool. Session pooler is for **backups**, not the Node runtime.
- `check_rate_limit` upserts then sweeps old rows — write amplification at high QPS; leave until load tests show it.

## Do not weaken RLS

Performance work must not grant `anon` extra tables or skip `assert_business_can_operate`.

## Next (when evidence exists)

- Per-IP marketplace browse key (today a global bucket).
- Vite `manualChunks` for Recharts.
- Cloudflare orange-cloud **only** after apex mapping is understood.
