# Kwetuu production-readiness audit — Phase 0

**Audit date:** 26 October 2026
**Repository:** `jemimahwarren3-max/businessssos`
**Audited base:** `master` at `f677481` (PRs #62, #64, and #65 merged)
**Local branch:** `feature/subscription-currency-billing`, at the same base commit
**Overall release decision:** **BLOCKED — not production-ready**

**Follow-up evidence (26 October 2026):** PR #66 remains open, but its
`check` and `e2e-smoke` jobs now pass at `585cf1a`. The CI run applied ten
pending migrations to **staging**, passed all 53 test files / 211 tests, and
passed all eight staging-readiness checks. This does not apply or validate the
uncommitted subscription-currency migration in this worktree. A separate local
packaging proof built and launched the hosted-site Windows and Android shells;
they are unsigned and do not establish authentication, offline operation, or
release readiness. See
[`PRODUCTION_READINESS_PHASE_1.md`](./PRODUCTION_READINESS_PHASE_1.md) and
[`DESKTOP_ANDROID_PACKAGING_POC.md`](./DESKTOP_ANDROID_PACKAGING_POC.md).

This is the initial repository, architecture, and local-baseline audit requested
before substantial hardening work. It is not a penetration test, provider
certification, legal opinion, live-environment inspection, restore drill, or
device release test. Existing audits listed below remain useful evidence, but
their dates and scopes must be considered; they do not establish current
production readiness.

## Change control and scope

- The audited worktree contains uncommitted subscription-currency changes
  from the preceding task: USD 7/month and ZiG (ZWG) 210/month, separate
  Paynow credentials, and a proposed database migration. These changes are
  **not part of the audited base commit**, have not been pushed, and the
  migration has not been applied to staging.
- `src/routeTree.gen.ts` was already marked modified in the worktree; no
  content diff was present when checked. It was not edited for this audit.
- The separate checkout at `..\simplibiz-os-main` also has pre-existing local
  changes. It was not used or modified.
- No secret values were read or recorded.
- No application code, database, deployment, or credentials were changed by
  this Phase 0 audit. This report is the only file added for this task.

## Architecture inventory

| Area | Observed state |
| --- | --- |
| Web framework | TanStack Start / TanStack Router, React 19, TypeScript, Vite 8, Nitro Node server. |
| Backend and identity | Supabase Auth and Postgres; tenant data is protected by RLS and security-definer RPCs; server functions provide trusted application operations. |
| Public and authenticated surfaces | Public marketing/storefront routes and a client-rendered authenticated merchant workspace under `src/routes/`. |
| Payments | Paynow subscription billing is server-side. Seller checkout/payment flows are separate and have their own approval/enablement restrictions. |
| Offline | PWA/IndexedDB cash-sale queue exists; internet is required for synchronization and most other operations. |
| Production deployment | GitHub-driven Cloud Run deployment was paused. This prevents new workflow deployments but does not establish the state of a running service or its DNS. |
| Desktop/mobile | PR #66, “Phase B: Tauri desktop + Capacitor Android scaffolding,” remains **open**, not merged. At `585cf1a`, both required CI jobs pass. A local proof built and launched hosted-site Windows/Android shells. These are unsigned, require the live hosted site, and do not establish authentication or offline operation. PR files are not part of the audited `master` baseline. |

Architecture and known product limitations are also described in
[`MULTI_PLATFORM_PHASE_A_AUDIT.md`](./MULTI_PLATFORM_PHASE_A_AUDIT.md) and
[`OFFLINE_AND_SYNC_DESIGN.md`](./OFFLINE_AND_SYNC_DESIGN.md).

## Local verification baseline

Commands were run from the audited app checkout on Windows. Results cover the
current worktree, including the uncommitted subscription-currency changes
noted above.

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| `npx tsc --noEmit` | **PASS** | Direct command exited successfully. |
| `npm test` | **PASS, limited** | 160 passed; 53 skipped. Skipped staging-dependent tests do not verify the live database. |
| `npm run build` | **PASS** | Production build exited successfully. Build emitted TanStack `inputValidator()` deprecation warnings. |
| `npm run lint` | **Initial FAIL; follow-up PASS** | Prettier line-ending policy was fixed; current lint has 0 errors and 14 existing warnings. |
| ESLint excluding only `prettier/prettier` | **PASS** | `npx eslint . --rule 'prettier/prettier: off' --quiet` exited successfully. |
| `npm run verify:local` | **Initial FAIL; follow-up PASS** | Windows process spawning was fixed; the current script completes type-check, lint, tests, and production build. |
| `npm audit --audit-level=high` | **Initial FAIL; follow-up PASS** | Zod upgraded to 4.6.7 and `serialize-javascript` overridden to 7.1.4; the current audit reports zero vulnerabilities. CI audit is now blocking in the local workflow; a remote CI run is pending. |
| Staging readiness/integration | **BLOCKED** | No staging migration or integration test was run for this audit. The 53 skipped tests mean these behaviours remain unverified locally. |

The local baseline above records the initial Phase 0 run. It is superseded for
staging and PR #66 evidence by the follow-up results in
[`PRODUCTION_READINESS_PHASE_1.md`](./PRODUCTION_READINESS_PHASE_1.md). The
Windows runner and line-ending lint findings were resolved in a follow-up
change: `npm run verify:local` now completes successfully on this Windows
checkout. It ran type-check, lint (0 errors; 14 existing warnings), tests
(160 passed, 53 staging tests skipped), and production build. Dependency
review upgraded Zod to 4.6.7 and fixed the low serializer advisory; the
current audit reports zero vulnerabilities. Staging tests remain outstanding
locally, and the changed CI audit gate still needs a remote run.

## Readiness register

Statuses: **NOT AUDITED**, **FAIL**, **IN PROGRESS**, **PASS**, **BLOCKED**,
**NOT APPLICABLE**. A PASS applies only to the stated, tested scope.

| Requirement | Existing implementation / evidence | Status | Gap or next evidence required |
| --- | --- | --- | --- |
| Architecture and environment map | Repository docs and current source identify TanStack Start, Supabase, server functions, PWA and the paused deployment path. | PASS — inventory only | Verify deployed environment and runtime configuration separately. |
| Local type-check, runnable tests and web build | Results above; staging-dependent tests skipped. | PASS — limited | Re-run staging suites and production smoke tests against an authorized non-production environment. |
| Repeatable local verification on Windows | Updated `scripts/verify-local.mjs` launches commands through the Windows shell; full gate completed successfully. | PASS — local only | Staging tests remain skipped without authorized staging configuration. |
| Repository lint on Windows | Prettier now honors existing line endings; normal `npm run lint` passes with 0 errors and 14 existing warnings. | PASS — lint only | Review the existing React refresh and hook-dependency warnings separately. |
| Dependency security gate | `npm audit` reports zero vulnerabilities after Zod 4.6.7 and serializer updates; CI audit now fails on high-severity findings. | PASS — local audit | Confirm the updated CI gate on a remote run; audit does not replace dependency review or staging verification. |
| Authentication, authorization and tenant isolation | PR #66 CI ran 53 test files / 211 tests with a staging token; staging readiness checks passed. | IN PROGRESS | Review test scope and add real browser flows for recovery, revocation, role changes and admin MFA; this is not a penetration test. |
| Payment and subscription lifecycle | Paynow poll/hash checks and subscription confirmation exist. Prior Phase A audit identifies remaining lifecycle and database-authority questions. | IN PROGRESS | Verify launch-vs-subscription policy, expiry/grace/renewal, direct RPC enforcement, callback replay, refunds and provider outcomes in staging. |
| USD + ZiG subscription billing | The audited base uses USD-only checkout. The current USD/ZiG changes are uncommitted and migration is unapplied. | IN PROGRESS | Review and stage the change; verify both credentials, fixed prices, provider currency/settlement, webhooks and polling using sandbox transactions. |
| Offline POS integrity and recovery | IndexedDB cash-sale queue and idempotency exist; offline design documents stock estimates and queue limitations. | IN PROGRESS | Test restart, quota/storage failure, repeated sync, concurrent devices, stock conflict review and retained receipts. No signed offline entitlement is evidenced. |
| Storefront, checkout and order lifecycle | Core storefront, order and payment flows are present; prior audits list incomplete refunds/returns/reconciliation and live E2E evidence. | IN PROGRESS | Run full safe end-to-end buyer and seller journeys, including stock, delivery/collection, notifications and cancellation/refund behaviour. |
| Windows and Android releases | PR #66 required CI checks pass. Local hosted-shell Windows/Android packaging and launch proof passed; artifacts are unsigned. | IN PROGRESS | Review/merge separately; validate authentication, signing, upgrades, rollback, clean-device installation, and actual device behavior. |
| Backups and recovery | A nightly encrypted backup workflow is documented. The recovery document records no successful restore test. | BLOCKED | Perform and record a restore into a safe separate project and a Cloud Run rollback drill. |
| Production deployment | Cloud Run deployment is intentionally paused; no live service inspection was performed. | BLOCKED | Establish separate staging/production configuration, approvals, migration and rollback gates before deploying. |
| Email, monitoring and operational alerts | Outbox, Resend and Sentry configuration paths are documented; external delivery/receipt is not demonstrated here. | NOT AUDITED | Verify runtime secret configuration, delivery failures/retries, observability receipt and incident procedures. |
| Legal, privacy and regulatory readiness | Existing legal-risk documents identify unanswered operator, consumer, tax and payment-provider questions. No legal review was performed. | BLOCKED | Obtain qualified legal/tax/provider review and confirm policies match actual product behaviour. |
| Accessibility and performance | No browser/device audit or representative performance measurement was run in Phase 0. | NOT AUDITED | Test keyboard/screen-reader flows, mobile layouts, low bandwidth and representative catalogue sizes. |

## Prior findings carried forward (not independently re-tested here)

- [`security/SECURITY_AUDIT.md`](./security/SECURITY_AUDIT.md), dated
  24 October, is a static audit and explicitly not a penetration test. It
  records staging authorization/RLS verification, restore testing, legal
  review and dependency work as remaining gates.
- [`PRODUCTION_READINESS_AUDIT.md`](./PRODUCTION_READINESS_AUDIT.md), dated
  19 October, records the application as not ready for public production and
  notes that backup restoration, staging tests, custom-domain setup and
  operator/legal actions were not proven.
- [`MULTI_PLATFORM_PHASE_A_AUDIT.md`](./MULTI_PLATFORM_PHASE_A_AUDIT.md)
  records offline POS and entitlement limitations. Its packaging status
  predates the open PR #66 and should be updated after that PR is reviewed or
  merged.
- [`BACKUP_AND_DISASTER_RECOVERY.md`](./BACKUP_AND_DISASTER_RECOVERY.md)
  states that no restore test is recorded and that its RPO/RTO are targets,
  not demonstrated results.
- [`KWETUU_PAYMENTS_AUDIT_AND_READINESS.md`](./KWETUU_PAYMENTS_AUDIT_AND_READINESS.md)
  records provider approval and production payment verification as external
  blockers. Do not enable seller payment processing on the basis of this
  report.

## Prioritized next actions

1. Review the Zod/serializer dependency updates and confirm the blocking audit
   step passes in remote CI.
2. Review PR #66 separately; do not treat scaffolded wrappers as release-ready
   until CI, clean installation, authentication, signing and device tests pass.
3. Run authorized staging RLS, tenant-isolation, billing, payment and
   migration tests. Do not run production migrations or real charges.
4. Finish the USD/ZiG subscription change as a separate reviewable change;
   confirm Paynow ZiG settlement configuration and test with sandbox accounts.
5. Exercise offline POS restart/synchronization/conflict cases and decide
   whether a bounded server-issued offline entitlement is required.
6. Complete a safe backup restore and rollback drill; obtain external legal,
   tax and payment-provider decisions before launch.

**Phase 0 decision:** The repository has a substantial existing implementation
and useful audit material, but a production release is **not approved**.
Proceed to narrow remediation stages only after reviewing this report. No
production deployment, live billing change, credential rotation, or release
was performed.
