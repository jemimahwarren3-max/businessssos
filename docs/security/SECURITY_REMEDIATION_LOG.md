# Security remediation log

Record of verified findings. No secret values or personal data in this file.

| ID | Severity | Component | Description | Fix | Verification | Residual / owner |
|----|----------|-----------|-------------|-----|--------------|------------------|
| KW-SEC-001 | Critical | `@tanstack/react-start` | Reflected XSS in server-function responses (GHSA-qx66-fv34-fjm8) on versions ≤1.168.59 | Patched versions installed: `@tanstack/react-start@1.168.60`, `@tanstack/start-server-core@1.169.39` | Local `npm audit` zero; type-check, tests, and build pass | Production deployment and runtime verification remain outstanding |
| KW-SEC-002 | High | Paynow shop confirmation | Forged poll / wrong amount could mark paid | `paynow-poll.ts`, payment-safety migration, stricter confirm RPC | Unit tests pass; staging RPC tests skipped | Staging apply + provider sandbox replay |
| KW-SEC-003 | High | Manual `mark_paid` on Paynow orders | Seller could bypass gateway | Payment-safety migration blocks or audits Paynow mark_paid path | Code + migration; staging not run | Merchant training |
| KW-SEC-004 | High | `paynow_confirm_payment` grant leak | Any authenticated user could confirm subs | Revoke grants; `billing-security.test.ts` | Unit in repo; staging test skipped | Re-audit new SECURITY DEFINER functions |
| KW-SEC-005 | High | Cross-tenant data access | RLS + RPC design | Existing migrations + `tenant-isolation.test.ts` | Not executed this environment | Run on staging |
| KW-SEC-006 | Medium | CSP `unsafe-inline` | XSS impact reduced by stripping merchant HTML but not eliminated | Documented in `SECURITY_ARCHITECTURE.md` | Manual browser CSP trial not done | Accept until nonce CSP verified |
| KW-SEC-007 | Medium | Staging schema drift | App ahead of deployed DB | `scripts/apply-staging-sql.mjs` list updated | Script exits 0 without token | Operator / MCP |
| KW-SEC-008 | Medium | Platform owner bypass self-assign | Users grant own entitlements | `platform_owner_foundation.sql` RLS deny + service_role only | `platform-owner-security.test.ts` skipped | Bootstrap once |
| KW-SEC-009 | Low | Rate limit fail-open | Postgres error allows request | Documented; monitor `rate_limit_hits` | By design | Ops monitoring |
| KW-SEC-010 | Informational | No external pentest | — | — | — | Schedule before public launch |

**Fixed in repo (Oct 2026, verify on staging):** shop credential encryption (`SHOP_PAYMENT_ENCRYPTION_KEY`), Paynow poll URL allowlist, seller Paynow global gate, platform entitlement RPC for owner subscription bypass, mail flush constant-time compare.
