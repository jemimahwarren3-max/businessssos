# Production readiness audit

Audited on 19 October 2026 against branch `cursor/production-readiness-dafe` (storefront, marketplace, shop subdomains included). This is a code and configuration review plus targeted unit tests. It is not a penetration test, a legal opinion, or a restore drill.

Status of this application: **not ready for public production**. Several security controls exist and are real. Several go-live gates are still unverified or blocked on people, money, or provider setup.

## Highest-risk problems

| ID  | Sev | Finding                                                                                                                                                              | Evidence                                                    | Impact                                                                                      | Fix this session?                                                                                                                                |
| --- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | P1  | GitHub CI only ran on `main`; the default branch is `master`. Feature PRs were not type-checked in CI.                                                               | `.github/workflows/ci.yml`                                  | Broken code can reach the default branch without CI.                                        | Yes. Triggers now include `master` and every pull request.                                                                                       |
| A2  | P1  | The PWA service worker registered on every page, cached HTML documents, and fell back to `/dashboard`. A shop host or shared browser could serve the merchant shell. | `vite.config.ts` Workbox config                             | Cross-user HTML leakage and wrong offline pages.                                            | Yes. SW registers only from the signed-in layout. Documents are not runtime-cached. Fallback is `/staff-login` and public routes are denylisted. |
| A3  | P1  | CSP `img-src` was `'self' data: blob:`. Storefront logos and product photos are https URLs.                                                                          | `src/start.ts`, storefront `logo_url` / `imageUrl`          | Published shops would show broken images in production.                                     | Yes. `img-src` now allows `https:`.                                                                                                              |
| A4  | P1  | Session cookie always set `Secure`. `APP_URL` for local and some preview hosts is `http://`.                                                                         | `src/lib/auth/session.server.ts`                            | Sign-in cookies never stick on HTTP.                                                        | Yes. Secure follows `APP_URL`.                                                                                                                   |
| A5  | P1  | Tenant isolation tests did not cover storefront or online-order tables.                                                                                              | `tests/integration/tenant-isolation.test.ts`                | A regression on shop tables would not fail CI.                                              | Yes. Those tables are now in the suite. Still needs `SUPABASE_ACCESS_TOKEN` to run.                                                              |
| A6  | P1  | Shop subdomains need wildcard DNS and TLS. Cloud Run custom domain mapping does not give `*.domain` by itself.                                                       | Cloud Run docs vs `src/lib/storefront/host.ts`              | `https://{slug}.domain` will not resolve until a load balancer or equivalent is configured. | Documented. Cannot be completed without the operator's DNS and GCP project.                                                                      |
| A7  | P1  | `npm audit` reports 13 issues (critical and high) in the lockfile. `npm audit fix` crashed.                                                                          | `npm audit --audit-level=high`                              | Supply-chain risk, mostly transitive.                                                       | Not silently force-upgraded. Recorded in `DEPENDENCY_REVIEW.md`. CI now prints the audit.                                                        |
| A8  | P1  | Nightly encrypted `pg_dump` exists. No restore has been executed in this environment.                                                                                | `.github/workflows/backup.yml`, `docs/disaster-recovery.md` | Unknown RPO/RTO.                                                                            | Procedure documented. Restore still unverified.                                                                                                  |
| A9  | P2  | No public security contact.                                                                                                                                          | `SECURITY.md`                                               | Researchers have nowhere safe to report.                                                    | Needs a real email from the operator.                                                                                                            |
| A10 | P2  | Legal pages are drafts. Operator identity, governing law, and Zimbabwe CDPA / consumer / ZIMRA questions are unanswered.                                             | `legal/*`, `docs/LEGAL_RISK_REGISTER.md`                    | Cannot claim compliance.                                                                    | Register updated. No invented legal conclusions.                                                                                                 |
| A11 | P2  | Customer checkout has no Paynow/EcoCash. Platform Paynow is subscription-only.                                                                                       | storefront payments SQL, `paynow.server.ts`                 | Fine if marketed honestly. Not a marketplace settlement system.                             | Unchanged.                                                                                                                                       |
| A12 | P2  | Offline POS queues cash sales in IndexedDB. Stock is an estimate until sync. No tests existed for the queue.                                                         | `src/lib/offline/*`                                         | Duplicate or conflicting stock if misunderstood.                                            | Sync tests added. Airplane-mode browser tests not run here.                                                                                      |
| A13 | P2  | Authenticated pages had no `Cache-Control: private, no-store`.                                                                                                       | `src/start.ts`                                              | Shared-device residual cache.                                                               | Header now set on merchant paths.                                                                                                                |
| A14 | P3  | README is still the original product prompt, not operator setup.                                                                                                     | `README.md`                                                 | New operators cannot follow it.                                                             | `ENVIRONMENT_SETUP.md` added instead of rewriting the whole README.                                                                              |
| A15 | P1  | Staging Postgres has `locations` and `create_product(..., _location_id)` that were not in git.                                                                       | Staging `pg_proc` / `information_schema`                    | Schema drift broke product seeding and could break POS.                                     | Back-ported in `20261019180000_locations_stock.sql`. App still omits `_location_id` and uses the default.                                        |

No **P0** (active unauthenticated data exposure or unauthenticated payment credit) was re-identified in this pass. Earlier grant leaks on `paynow_confirm_payment` were already closed in `20260808210000_fix_grant_leaks.sql` / `20260808220000_fix_broken_secdef_check.sql` and covered by `tests/integration/billing-security.test.ts`.

## Recommended sequence

1. Keep staging (`slajanbsfqjnuuiohbmg`) as the only database this agent may migrate.
2. Land this documentation and the P1 code fixes.
3. Operator: security email, legal entity, Paynow merchant status, Cloud Run project, wildcard TLS.
4. Run tenant isolation and billing integration tests with `SUPABASE_ACCESS_TOKEN`.
5. Restore a backup into a throwaway Supabase project.
6. Only then point production `maidxfntfpnkcqnuhozo` at Cloud Run and apply storefront migrations there with explicit approval.

## Complexity and external dependencies

- Code and docs in this PR: local, reversible.
- Wildcard shops on Cloud Run: Google HTTPS load balancer (or Cloudflare) plus a wildcard certificate. Not a Dockerfile change.
- Legal: Zimbabwean lawyer and tax practitioner.
- Payments: Paynow merchant approval. Customer wallets are not built.
- HaveIBeenPwned leaked-password check: Supabase paid plan.
- Restore test: production DB password secret and a throwaway project.

## Files and database objects

Changed in this stage: session cookie helper, CSP and cache headers, PWA registration, CI branches, Dockerfile, tenant isolation coverage, offline sync tests. No new production migration. Staging already has storefront, marketplace, and reserved host-slug functions.

## Tests that verify the fixes

- `vitest run tests/session-cookie.test.ts tests/offline-sync.test.ts tests/storefront.test.ts`
- Integration (needs token): `tests/integration/tenant-isolation.test.ts`, `billing-security.test.ts`
- Typecheck: `npx tsc --noEmit`

## Legal questions for humans

See `LEGAL_COMPLIANCE_REGISTER.md`. Short list: who the contracting entity is, governing law, CDPA/POTRAZ duties, consumer disclosures, ZIMRA fiscalisation, marketplace vs software-provider role, DPAs with Supabase/Paynow/Groq.

## Cannot be completed here

Production deploy, Cloud Run DNS, wildcard TLS, Paynow live charges, restore drill, screen-reader testing, penetration test, lawyer review, inventing a company address, applying storefront SQL to production.
