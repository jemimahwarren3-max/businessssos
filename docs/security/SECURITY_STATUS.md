# Security programme status

**Last updated:** 24 October 2026 (Africa/Harare)  
**Branch baseline:** `master` (payment safety, platform owner, growth intelligence migrations in repo)  
**Standards referenced:** OWASP ASVS 4.0.3 (L1 baseline; L2 target for payments/tenant isolation), OWASP Top 10 (2021), OWASP API Security Top 10 (2023), NIST SSDF practices, Supabase security guidance.

Status keys: **not started** | **in progress** | **blocked** | **fixed, not verified** | **verified** | **accepted residual risk**

| Domain | Status | Notes |
|--------|--------|--------|
| Repository baseline audit | verified | Code, migrations, tests, deploy workflow reviewed Oct 2026 |
| Threat model (STRIDE) | verified | `THREAT_MODEL.md` |
| RLS / multi-tenant isolation | staging-tested, production not verified | Staging integration suite passed in PR #66 CI on 26 Oct 2026 after migrations; no production verification or penetration test |
| Authentication / sessions | fixed, not verified | OAuth fix merged; staging Auth config operator task |
| Platform owner / admin | staging schema/tests verified; operator setup not verified | CI checked owner schema/functions and platform-owner tests; real owner bootstrap and MFA enrollment remain operator tasks |
| Payment integrity (manual + PayNow) | staging-tested, provider not verified | Payment-safety integration tests passed after staging migration; no real Paynow transaction or provider approval |
| Seller Paynow enablement | accepted residual risk | Default off; provider approval required |
| CSP / browser headers | accepted residual risk | `unsafe-inline` for TanStack/Radix; documented |
| Dependency advisories | patched, locally verified; production not verified | `npm audit` reports zero; Zod 4.6.7 and patched TanStack Start/server-core are installed. CI audit is now blocking; see `DEPENDENCY_SECURITY.md` |
| Secrets in repo / CI | verified | `.env` gitignored; service role server-only |
| Backup / restore | blocked | Workflow exists; restore drill not executed |
| Production go-live gate | not started | See `PRODUCTION_SECURITY_CHECKLIST.md` |
| External penetration test | not started | Out of scope for repo-only work |

**Remaining blockers / operator actions**

1. Re-run staging checks against the final release candidate; the 26 Oct CI run
   applied ten pending migrations and did not target production.
2. Bootstrap the real platform owner per `docs/PLATFORM_OWNER_BOOTSTRAP.md`
   and verify MFA enrollment; CI schema checks do not complete operator setup.
3. Obtain written Paynow approval before enabling seller automated checkout.

**Next engineering slice:** Review the final staging test evidence and close
open findings in `SECURITY_REMEDIATION_LOG.md`; separately validate operator
setup, provider behavior, and production controls.
