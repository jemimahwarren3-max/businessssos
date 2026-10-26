# Security programme — final report (repository pass)

**Date:** 24 October 2026  
**Scope:** Kwetuu / BusinessOS repository on `master` plus this documentation commit.

**Follow-up (26 October 2026):** The repository now uses the patched
`@tanstack/react-start@1.168.60` and `@tanstack/start-server-core@1.169.39`;
the local dependency audit reports zero vulnerabilities after the Zod 4.6.7
upgrade. Type-check, tests, lint, and production build pass locally. This does
not prove that the patched build is deployed or verified in production; the
operational gates below remain open.

## 1. Overall assessment

**Moderate maturity** for a pre-launch SaaS: strong tenant/payment *design*, substantial automated tests, recent payment-safety and platform-owner hardening in SQL. **Not verified for production** — staging evidence must be refreshed for the final release candidate, backup restore is untested, and the deployed dependency state is unknown.

## 2. Critical / high findings (open or accepted)

| ID | Severity | Summary | Status |
|----|----------|---------|--------|
| KW-SEC-001 | Critical | TanStack Start XSS advisory | Patched in repository; production deployment not verified |
| KW-SEC-002–004 | High | Payment forgery / grant leaks | Fixed in repo; **not verified on staging** |
| KW-SEC-005 | High | Cross-tenant access | Controls present; staging tests skipped |

## 3. Fixed in repository (verification = unit/build unless noted)

- Payment poll URL allowlist, amount minor-units compare, dedicated shop encryption key
- Payment-safety migration (seller confirm audit, Paynow path hardening)
- Platform owner roles/entitlements (no self-grant)
- Owner subscription bypass via DB RPC + `canWriteWithPlatformEntitlement`
- Mail flush constant-time secret compare
- OAuth PKCE / session fixes (prior PRs)

## 4. Blocked / needs your approval

- Apply migrations to **staging** (and production only after review)
- Run integration tests with `SUPABASE_ACCESS_TOKEN`
- Bootstrap platform owner (`PLATFORM_OWNER_BOOTSTRAP.md`)
- Enable seller Paynow (provider + legal)
- Backup restore drill
- Verify patched TanStack/Zod dependency build is deployed

## 5. Tests executed this pass

- `npm test`: **141 passed**, 51 skipped (staging)
- `npm run build`: not re-run this commit (unchanged application code)

## 6. Production actions requiring approval

- Production migration apply
- `BILLING_ENABLED=true`
- Seller Paynow global approval
- Secret rotation if any exposure suspected

## 7. Remaining legal / external

- CDPA/POTRAZ assessment
- External penetration test before broad public launch
- Paynow marketplace settlement confirmation

## 8. Next steps

1. Supabase MCP or `apply-staging-sql.mjs` with access token → apply pending migrations.  
2. Run full `tests/integration/*` on staging.  
3. Merge TanStack upgrade when build green.  
4. Complete `PRODUCTION_SECURITY_CHECKLIST.md`.

**We do not claim the platform is completely secure.** This report states what was inspected, tested locally, and what was not.
