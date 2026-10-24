# Security programme status

**Last updated:** 24 October 2026 (Africa/Harare)  
**Branch baseline:** `master` (payment safety, platform owner, growth intelligence migrations in repo)  
**Standards referenced:** OWASP ASVS 4.0.3 (L1 baseline; L2 target for payments/tenant isolation), OWASP Top 10 (2021), OWASP API Security Top 10 (2023), NIST SSDF practices, Supabase security guidance.

Status keys: **not started** | **in progress** | **blocked** | **fixed, not verified** | **verified** | **accepted residual risk**

| Domain | Status | Notes |
|--------|--------|--------|
| Repository baseline audit | verified | Code, migrations, tests, deploy workflow reviewed Oct 2026 |
| Threat model (STRIDE) | verified | `THREAT_MODEL.md` |
| RLS / multi-tenant isolation | fixed, not verified | Integration tests exist; need staging token + applied migrations |
| Authentication / sessions | fixed, not verified | OAuth fix merged; staging Auth config operator task |
| Platform owner / admin | fixed, not verified | SQL + MFA gate; bootstrap not run on staging |
| Payment integrity (manual + Paynow) | fixed, not verified | `20261023120000_payment_safety_foundation.sql`; staging apply pending |
| Seller Paynow enablement | accepted residual risk | Default off; provider approval required |
| CSP / browser headers | accepted residual risk | `unsafe-inline` for TanStack/Radix; documented |
| Dependency CVEs (TanStack) | in progress | GHSA documented; upgrade blocked on build — see `DEPENDENCY_SECURITY.md` |
| Secrets in repo / CI | verified | `.env` gitignored; service role server-only |
| Backup / restore | blocked | Workflow exists; restore drill not executed |
| Production go-live gate | not started | See `PRODUCTION_SECURITY_CHECKLIST.md` |
| External penetration test | not started | Out of scope for repo-only work |

**Blockers requiring operator action**

1. Apply staging migrations (incl. payment safety + platform owner) via authorised process or Supabase MCP.
2. Configure `SUPABASE_ACCESS_TOKEN` for CI/agent to run integration tests.
3. Bootstrap platform owner per `docs/PLATFORM_OWNER_BOOTSTRAP.md`.
4. Written Paynow approval before seller automated checkout.

**Next engineering slice:** Run staging integration suite after (1); close open findings in `SECURITY_REMEDIATION_LOG.md`.
