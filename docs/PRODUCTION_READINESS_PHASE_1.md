# Kwetuu pre-launch readiness audit — Phase 1

**Audit date:** 26 October 2026
**Scope:** Evidence-based review of repository features, documented launch
requirements, the latest available PR #66 CI run, and the local desktop/mobile
packaging proof.
**Decision:** **Do not launch publicly yet.** This report distinguishes code
that exists from behavior tested in CI and from production/operator behavior
that is not verified. It is not a penetration test, legal opinion, provider
certification, live-production inspection, or restore drill.

## Executive summary

- Kwetuu already contains broad merchant, storefront, marketplace, and platform
  billing functionality; routes and schema presence are not proof that every
  user journey is complete.
- On PR #66 at `585cf1a`, GitHub Actions passed `check` and `e2e-smoke`.
  The `check` job reported **53 test files and 211 passing tests** and eight
  staging-readiness checks passing. The run applied ten pending migrations to
  **staging**, not production. This is better evidence than the earlier Phase 0
  run, but it is not a production release approval.
- The smoke runner was pinned to Ubuntu 24.04 because Playwright 1.55.1 did not
  support the prior Ubuntu 26.04 runner. The rerun's deployed smoke checks
  passed.
- A separate local proof built and launched hosted-site desktop and Android
  shells. They depend on `https://mykwetuu.com/staff-login`, are unsigned, and
  are not an offline client. A bundled Capacitor build is not available because
  the production output has no static `index.html`.
- No production migrations, deployment, live payment, or PR merge occurred.
- A follow-up Windows run of `npm run verify:local` now passes after correcting
  Windows process spawning and configuring Prettier for checkout line endings.
  It completed type-check, lint (0 errors, 14 existing warnings), 160 tests
  passed / 53 staging tests skipped, and production build. After the Zod 4
  migration and serializer override, `npm audit` reports zero vulnerabilities.
  The staging tests skipped locally do not replace the PR #66 staging CI evidence.
- USD/ZiG subscription billing is still an **uncommitted local change**. The
  proposed migration was not included in PR #66's staging migration run and
  has not been applied or verified with Paynow sandbox transactions.

## Evidence legend

- **Implemented:** repository code or configuration exists. This says nothing
  by itself about deployment or successful operation.
- **Tested:** an identified automated or local test/build passed for the
  described scope.
- **Not verified:** evidence is missing, external/operator-dependent, or the
  relevant scenario was not exercised.
- **Known limitation:** current documentation or code explicitly limits the
  behavior.

## Feature and capability audit

| # | Area | Implemented | Tested evidence | Not verified / remaining gap |
|---:|---|---|---|---|
| 1 | Architecture and environments | TanStack Start web app, Supabase Auth/Postgres, server functions, Cloud Run path and PWA are documented. | Local production build passed in the Phase 0 run. | Live production topology, environment separation, DNS/TLS, and runtime configuration were not inspected. |
| 2 | Build and developer verification | TypeScript/build/test/lint scripts exist. | Full `npm run verify:local` passed on Windows after the runner and Prettier fixes. | 53 staging-dependent tests are skipped locally; lint reports 14 pre-existing warnings. |
| 3 | CI and release workflow | GitHub Actions checks and smoke workflow exist; PR #66 pins the Playwright runner to Ubuntu 24.04. | PR #66 `check` and `e2e-smoke` passed at `585cf1a`; deployed smoke passed. | PR #66 is open and unmerged; approval, merge, production deployment, rollback, and release authorization are outstanding. |
| 4 | Dependency risk | Lockfile and dependency audit workflow exist. | Zod upgraded to 4.6.7, serializer override set to 7.1.4, and local `npm audit` reports zero vulnerabilities. | Confirm Zod migration and newly blocking audit step in remote CI. |
| 5 | Secrets and environment configuration | `.env` is gitignored; server-side secret use and setup documentation exist. | Repository tests and build passed; CI used masked secrets. | No dedicated full-history secret scan or production secret/configuration review was performed. No secret values were inspected. |
| 6 | Authentication and sessions | Supabase Auth, session cookie handling, OAuth/recovery routes, and staff login exist. | Session and auth tests passed within CI. | Full account lifecycle in browser (recovery, revocation, cookie behavior on production domains) was not verified. |
| 7 | Roles, permissions, and platform admin | Business permissions, platform owner/admin controls, and MFA-related gates exist. | Platform-owner and permissions integration tests were in the 211-test CI run; staging readiness checks passed. | Real operator bootstrap, enrolled MFA, real admin account, and manual admin-denial browser checks are not evidenced. |
| 8 | Tenant isolation and RLS | RLS policies and tenant-isolation tests exist. | Staging-backed integration suite ran in CI with `SUPABASE_ACCESS_TOKEN`; all reported tests passed. | No independent adversarial assessment or production RLS verification was performed. |
| 9 | Migrations and data integrity | 67 SQL migration files are present in the local checkout. | The CI run applied ten pending migrations to staging and passed eight schema/readiness assertions. | Production schema state is unknown; migration rollback and backup-before-migration procedures were not exercised. |
| 10 | Platform subscriptions | Subscription billing and Paynow server flow exist; billing is feature-gated. | Existing billing tests passed in CI. | Billing enablement and full lifecycle/expiry/refund/reconciliation are not verified against production provider events. |
| 11 | USD/ZiG subscription choice | Local uncommitted code proposes USD 7 and ZWG 210 monthly pricing with separate Paynow credentials. | Unit/type/build evidence from the preceding local task passed. | Not merged, not in the PR #66 staging run, migration unapplied, and no ZiG sandbox charge/poll/webhook/settlement evidence. |
| 12 | Seller payment and settlement | Manual seller instructions/proof and separate seller Paynow paths exist; safety controls/default-off behavior are documented. | Payment-safety integration tests passed in the staging CI run. | Provider approval, seller account settlement, refunds/reconciliation, and real test-payment lifecycle are not verified. Platform credentials must remain subscription-only. |
| 13 | Merchant onboarding and workspace | Onboarding and merchant workspace routes exist for business setup and operations. | Typecheck/build and existing unit tests passed. | Successful new-merchant onboarding and recovery journey were not run end-to-end in a browser. |
| 14 | Catalogue and inventory | Product/category and stock-management features exist, including inventory history and media upload. | Product/media and inventory-related tests ran in CI. | Product variants, branch transfers, high-contention inventory, and file malware scanning are not implemented/verified. |
| 15 | POS, till, and sales | POS, sales, cash-drawer, receipt, and sale-history flows exist. | Cash-drawer and transaction-related tests passed in CI. | Full merchant/staff device journey, real receipt printing, and operational reconciliation were not tested. |
| 16 | Offline POS and sync | IndexedDB supports a bounded queued cash-sale flow with idempotent sync and conflict rejection. | Offline-sync tests passed in CI. | Offline stock is an estimate; restart/quota/device-loss, long-offline entitlement, multiple-device contention, and airplane-mode journeys remain unverified. |
| 17 | Storefront and marketplace | Public store/product/search/market routes and template customization are implemented. | Storefront/marketplace tests passed; CI smoke passed for the deployed target. | Wildcard DNS/TLS, public cache invalidation, screen-reader journeys, and real merchant publication were not verified. |
| 18 | Checkout, orders, and fulfilment | Store checkout/order flows, server-priced order lines, and status/fulfilment fields exist. | Storefront, fulfilment, and payment safety tests passed in CI. | Checkout is single-shop; delivery geocoding, automated courier dispatch, returns/refunds, and end-to-end buyer journeys are incomplete or unverified. |
| 19 | Notifications and email | Email outbox and Resend flush paths exist; WhatsApp integration is not connected. | Email/outbox tests passed in CI. | Live sender verification, scheduled delivery, bounce/retry handling, provider account permissions, and customer receipt were not proven. A CI email-provider settings PATCH returned 403 for missing permissions. |
| 20 | Windows desktop | Tauri hosted-site shell and packaging configuration exist on PR #66. | Local build/install/launch proof passed for an unsigned installer. | PR is not merged; signed publisher build, clean-PC installation, auth/session behavior, upgrade/uninstall and release distribution remain unverified. |
| 21 | Android | Capacitor hosted-site shell exists on PR #66. | Local sync and debug/unsigned-release APK build and emulator launch passed. | No signed APK/AAB, store release, clean physical-device run, auth validation, offline client, or update path verified. |
| 22 | Backup, restore, and rollback | Encrypted backup workflow and recovery procedures are documented. | Documentation/workflow exists. | No successful restore drill, measured RPO/RTO, or Cloud Run rollback exercise is recorded. |
| 23 | Monitoring and incident response | Incident procedures and optional monitoring hooks are documented. | Repository configuration exists. | Alert delivery, dashboard coverage, paging/escalation, and incident-response rehearsal were not demonstrated. |
| 24 | Privacy, legal, fiscal, and provider compliance | Data inventory and draft privacy/terms/refund documents and risk registers exist. | Documentation reviewed; no compliance test is claimed. | Operator identity, legal review, Zimbabwe CDPA/consumer/tax/fiscalization questions, and provider approvals remain open. |
| 25 | Accessibility, performance, and localization | Accessibility/legal routes and responsive UI work exist. | No measured evidence from this audit. | Screen-reader/keyboard audit, low-bandwidth and load/performance testing, and complete local-language support are not verified. |
| 26 | Support and launch operations | Help/contact and operational documentation routes exist. | Repository evidence only. | Support ownership/SLA, public security contact, launch staffing, and a rehearsed customer/seller escalation process are not confirmed. |

## Release-gate tracker (21)

The rows below are the evidence currently required before public launch. A
passing CI job is not treated as proof of an external or production control.

| # | Gate | Status | Evidence or closure required |
|---:|---|---|---|
| 1 | Approved production architecture and environment separation | **Not verified** | Confirm live topology, staging/production credentials, hostnames, and operator access without exposing secrets. |
| 2 | Required CI checks | **Pass for PR #66 head only** | `check` and `e2e-smoke` passed at `585cf1a`; keep required checks green on the merge candidate. |
| 3 | Windows local verification | **Pass** | Full local gate completed on Windows; rerun when relevant code changes. |
| 4 | Standard lint gate | **Pass with warnings** | Normal lint passes without suppressing formatting rules; 14 existing warnings remain for separate review. |
| 5 | High-severity dependency advisory | **Pass locally; remote CI pending** | Local `npm audit` reports zero vulnerabilities; dependency audit is now blocking in CI configuration. Confirm the new workflow on a remote run. |
| 6 | Secret hygiene and production configuration | **Partial / not verified** | Run dedicated secret scanning and review production settings/rotation/access. No credentials were read for this audit. |
| 7 | Staging schema readiness | **Pass for the PR #66 CI run** | Ten pending migrations applied; eight readiness checks passed. Re-check against the intended release candidate before launch. |
| 8 | Production migration plan | **Not verified** | Review exact migration set, approval, backup, ordering, rollback/forward-fix plan; do not infer production state from staging. |
| 9 | Tenant isolation and RLS | **Staging tests passed; production not verified** | Preserve CI evidence and perform release-candidate review; no penetration test is claimed. |
| 10 | Authentication, permissions, and platform owner | **Partial** | Integration tests passed; bootstrap real operator, enforce MFA, and complete manual browser checks. |
| 11 | Subscription billing lifecycle | **Not verified end-to-end** | Confirm billing flag, callback/poll lifecycle, expiry/refund/reconciliation, and provider test transaction. |
| 12 | USD/ZiG subscription migration and provider behavior | **Blocked / local-only** | Review and merge the local change separately, apply to staging through approved process, and prove both currencies with sandbox credentials/settlement. |
| 13 | Seller payment approval and settlement separation | **Blocked on provider/operator evidence** | Keep seller Paynow disabled until written provider approval and legal review; verify seller settlement without using platform subscription credentials. |
| 14 | Core merchant and buyer journeys | **Not verified end-to-end** | Execute signup/onboarding, catalogue, POS, storefront, checkout, fulfilment, cancellation/refund and notification journeys in staging. |
| 15 | Offline POS recovery and conflict handling | **Partial** | Unit tests pass; prove real device restart/storage failure/retry/conflict behavior and define entitlement limits. |
| 16 | Windows/Android release readiness | **Partial** | Local unsigned shells built/launched; merge review, signing, authentication, clean-device install, upgrades and rollback still required. |
| 17 | Email, monitoring, and alert operations | **Not verified** | Verify external provider config and a delivered message/alert; resolve CI email-provider permission failure. |
| 18 | Backup and restore | **Blocked** | Complete a restore to an isolated project and record measured recovery objectives. |
| 19 | Deployment, rollback, and DNS/TLS | **Blocked / not exercised** | Confirm deployment approval, test rollback, and prove production domains/TLS/cache behavior. |
| 20 | Legal, privacy, fiscal, and consumer obligations | **Blocked on qualified review** | Name the operator and obtain jurisdiction-appropriate legal/tax/provider decisions before claiming compliance. |
| 21 | Accessibility, performance, support, and incident readiness | **Not verified** | Conduct representative accessibility/performance review, set support ownership, and rehearse incident/escalation process. |

## CI and staging details

- Repository: `jemimahwarren3-max/businessssos`, PR #66.
- Head: `585cf1ad86e58bb6910bc8083bb6534914f1ec99`.
- Run: `40331354837`; `check` and `e2e-smoke` both passed.
- The `check` job used the masked staging Management API token. It reported 53
  test files / 211 passing tests and eight staging-readiness assertions passed.
- Ten pending SQL migrations ran against **staging**. Three later storefront
  migrations were already applied and skipped. Production was not targeted.
- An email-provider configuration PATCH failed with HTTP 403 because the CI
  identity lacked `auth_config_write` and `project_admin_write`; this does not
  invalidate the green code/test checks, but external email configuration is
  not verified.
- The staging migrations and CI run did not include the worktree-only
  `20261026120000_subscription_currency_pricing.sql`.

## Recommended sequence

1. Keep the local USD/ZiG changes separate. Review them, then run staging
   migration and sandbox payment checks only after confirming the ZiG
   integration actually charges/settles ZWG.
2. Confirm the updated dependency audit gate in remote CI; the Windows local
   verification and normal lint blockers are resolved.
3. Review PR #66 independently. Do not merge solely because checks pass; the
   hosted-shell behavior, signing and support model need explicit acceptance.
4. Execute the restore drill, production migration rehearsal, legal/provider
   decisions, and the remaining staging user journeys.
5. Approve public launch only after each applicable gate has named evidence
   and an owner for accepted residual risk.

**No production deployment, production migration, live payment, or PR merge
was performed for this audit.**
