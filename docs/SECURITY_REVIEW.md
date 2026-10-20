# Security review

Companion to `SECURITY.md`. This review is scoped to the current codebase after storefront, marketplace, and shop subdomains. Target: OWASP ASVS L1, moving toward L2 for money and tenant isolation. Unmet requirements are listed as unmet.

## Authentication

Implemented: Supabase Auth, httpOnly sealed session cookie, PKCE Google OAuth, generic login errors, IP rate limits, MFA for enrolled users and required for platform admin, reauth on sensitive account changes.

Unmet / unverified: leaked-password protection (Supabase paid), email verification enforcement not independently re-tested this session, session revocation after password change depends on Supabase Auth (not re-tested here), no in-app TOTP recovery for the single admin.

## Authorisation

Implemented: RLS on business-owned tables, `has_permission` for granular staff actions, security-definer RPCs for writes, public shop data only through `get_public_store` / `browse_marketplace`. Service role is ESLint-allowlisted.

Unmet: this session did not send raw PostgREST requests with the anon key against staging. Integration tests exist and now include storefront tables, but they need `SUPABASE_ACCESS_TOKEN` and were not executed in this environment (no `.env`).

## Storefront-specific

- Public RPCs are rate-limited in SQL (`check_rate_limit`).
- HTML in merchant copy is stripped (`storefront_plain`).
- Payments.paynow is forced false for customer checkout.
- Preview stays on the apex host because the session cookie is host-only. That is intentional, not a bypass.

## Headers and cookies

- CSP, HSTS, nosniff, DENY frames, Referrer-Policy, Permissions-Policy: `src/start.ts`.
- `script-src` still allows `'unsafe-inline'` (TanStack SSR and Radix). ASVS wants nonces. Unmet.
- Images: `https:` allowed so merchant product URLs work.
- Connect: Supabase plus Sentry ingest hosts.
- Private merchant paths send `Cache-Control: private, no-store`.
- Cookie `Secure` is tied to `APP_URL`.

## Abuse

Postgres `check_rate_limit` is shared across instances. Fail-open if Postgres errors. In-memory limiters are not used for auth.

## Secrets

`.env*` gitignored. `.env.example` has names only. Browser bundle may contain `VITE_*` publishable keys by design. Service role must never get a `VITE_` prefix.

## ASVS gaps (not claimed complete)

- V2 password policy beyond length 8.
- V7 logging of security events to a SIEM.
- V10 malicious file upload (no upload buckets exist).
- V13 API inventory / OpenAPI.
- V14 build integrity / SBOM (not generated).
