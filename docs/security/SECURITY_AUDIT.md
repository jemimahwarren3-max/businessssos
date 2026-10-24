# Kwetuu security audit

**Audit date:** 24 October 2026  
**Scope:** Full repository (application, migrations, CI/CD, docs). Not a live penetration test or legal review.  
**Method:** Static review, `npm test`, `npm run build`, migration/RLS review, alignment with OWASP ASVS L1 (L2 aspirational for payments/tenancy).

## Executive summary

Kwetuu implements **defence in depth** for multi-tenancy (RLS + server functions), **separate payment flows** (platform subscription vs seller checkout), and **honest manual payments** (proof upload does not mark paid). Recent work adds **payment-safety** and **platform owner entitlements** in SQL.

**Not launch-ready** without: staging migration apply, integration test execution, backup restore drill, dependency upgrade for TanStack GHSA, and operator bootstrap of platform owner.

## Authentication (ASVS V2–V4)

| Control | Status | Evidence |
|---------|--------|----------|
| Server-side session | Implemented | Sealed cookie, `src/lib/auth/` |
| OAuth PKCE | Implemented | `#40`, oauth-callback.server |
| Generic login errors | Implemented | auth routes |
| Rate limits on auth | Implemented | `check_rate_limit`, login failure counters |
| MFA for platform admin | Implemented | `requireAdmin` + AAL2 |
| Email signup | Environment-dependent | Staging may disable email provider |

**Gaps:** Session revocation after password change not re-tested; leaked-password protection (Supabase paid) not enabled.

## Authorisation & RLS (ASVS V4)

- RLS enabled on tenant tables; public data via `get_public_store`, `browse_marketplace`.
- `SECURITY DEFINER` functions use fixed `search_path`; grants reviewed for billing/admin/payment confirm.
- Granular permissions via `has_permission` / `get_my_permissions`.

**Gap:** Direct PostgREST abuse testing requires staging with `SUPABASE_ACCESS_TOKEN`.

## Payments (ASVS financial integrity)

| Flow | Verification model |
|------|---------------------|
| Manual seller pay | Seller confirms after checking own wallet; proof → `pending` only |
| Shop Paynow | Callback hash + poll + amount/currency checks (post payment-safety migration) |
| Platform sub Paynow | Separate `subscription_payments`; poll before `paynow_confirm_payment` |

Seller Paynow **globally gated** until operator approval reference set.

## Application security (ASVS V5, V14)

- Input validation: Zod on server functions; storefront plain-text stripping.
- CSRF: TanStack CSRF middleware on server functions.
- Headers: CSP, HSTS, nosniff, frame deny — `src/start.ts`.
- CSV formula injection: `src/lib/csv.ts` prefix escape.
- Uploads: product-media and payment-proofs — type/size limits; private proof bucket.

**Gaps:** CSP allows `unsafe-inline`; TanStack XSS advisory open until upgrade.

## Secrets (ASVS V14)

- Service role and payment keys server-only; ESLint restricted imports.
- `SHOP_PAYMENT_ENCRYPTION_KEY` separate from session secret (deploy from GitHub secret).

## AI (Groq)

- Business advisor and storefront AI builder: structured output / validation; no direct payment or RLS bypass in tool design.
- **Residual:** Prompt injection may affect copy suggestions — not financial writes without existing permission gates.

## Infrastructure

- Cloud Run deploy via WIF; secrets via GitHub → Cloud Run env.
- Staging project ref `slajanbsfqjnuuiohbmg` hard-coded in apply script (production ref blocked).

## Tests executed (this audit branch)

- `npm test`: 137 passed, 51 skipped (staging/integration).
- `npm run build`: passed on current master line.

## Related documents

All under `docs/security/` plus `../SECURITY.md`, `../KWETUU_PAYMENTS_AUDIT_AND_READINESS.md`, `../PLATFORM_OWNER_BOOTSTRAP.md`.
