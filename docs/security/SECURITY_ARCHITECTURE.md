# Security architecture

## Layers

1. **Browser** — Publishable Supabase key only (`VITE_*`). Session cookie httpOnly. CSRF token on server-fn POSTs.
2. **Cloud Run** — Validates session, permissions, billing entitlements, rate limits; holds service role and payment secrets.
3. **Supabase Postgres** — RLS for member-scoped clients; privileged mutations via security definer RPCs with explicit grants.
4. **Storage** — Public product-media; private payment-proofs; signed URLs for authorized reads.
5. **Providers** — Paynow (HTTPS poll allowlist), Resend (outbox + flush secret), Groq (server-only API key).

## Payment boundaries

```
Customer ──► Seller checkout (manual / shop Paynow)
                 └──► Seller's Paynow account OR off-platform instructions
Platform seller ──► Settings / Billing ──► Kwetuu PAYNOW_INTEGRATION_* ──► subscription_payments
```

Never route seller customer funds through platform Paynow credentials.

## Platform owner

- Identity: invited Supabase user + one-time `bootstrap_platform_owner(email)` (SQL editor, service context).
- Entitlement: `owner_subscription_bypass` via `has_platform_subscription_bypass()` RPC (not client-set).
- Admin UI: legacy `PLATFORM_ADMIN_USER_ID` + MFA AAL2 for billing oversight RPCs.

## Headers (`src/start.ts`)

CSP connects to Supabase and Sentry; `img-src https:` for merchant images; `frame-ancestors 'none'`.  
**Residual:** `script-src 'unsafe-inline'` until nonce strategy is browser-verified.

## Caching

Merchant authenticated paths: `Cache-Control: private, no-store`. Public shop pages cacheable at CDN discretion.

See `ACCESS_CONTROL_MATRIX.md` for role × resource summary.
