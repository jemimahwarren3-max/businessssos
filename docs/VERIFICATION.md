# Verification playbook

Use this to **build and verify** Kwetuu against the master checklist without guessing.

## Layers

| Layer | Command | Needs |
| ----- | ------- | ----- |
| Local gate | `npm run verify:local` | Node 22, `npm ci` |
| Staging DB + integration | `npm run verify:staging` | `SUPABASE_ACCESS_TOKEN` |
| Staging schema only | `npm run staging:readiness` | Token |
| Apply pending migrations | `npm run staging:apply` | Token (CI runs this on every push) |
| Deployed smoke (read-only) | `npm run test:e2e` | `@playwright/test`, optional `E2E_BASE_URL` (default `https://mykwetuu.com`) |

Integration tests **never** target production. Staging ref is hard-coded in `scripts/staging-api.mjs` and `tests/integration/helpers.ts`.

## Operator secrets (GitHub Actions)

Set these on the repository so CI can run the full staging suite:

1. `SUPABASE_ACCESS_TOKEN` — account token from Supabase dashboard (not the DB password).
2. `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_PUBLISHABLE_KEY`, `STAGING_SUPABASE_PROJECT_ID`, `STAGING_SUPABASE_SERVICE_ROLE_KEY` — staging project.
3. `CI_SESSION_SECRET` — random string for build step.
4. For live email: `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, `MAIL_FLUSH_SECRET`.

After migrations apply, bootstrap the platform owner per `docs/PLATFORM_OWNER_BOOTSTRAP.md`.

## CI behaviour

On each push/PR, CI runs `verify:local` steps individually (typecheck, lint, test, build), applies `staging:apply`, runs `staging:readiness` when a token is present, then runs Vitest (integration suites activate when the token is set).

## Master checklist tracking

Gap analysis mapped to checklist §1–§23: `docs/MASTER_CHECKLIST_GAP.md`.  
Twelve workflows mapped to tests: `docs/WORKFLOW_VERIFICATION.md`.  
Execution table: `docs/EXECUTION_STATUS.md` — update after each verified slice.

## What “verified” means here

- **Local verified:** commands above passed in this environment.
- **Staging verified:** readiness checks green + integration tests passed with token.
- **Production verified:** operator sign-off only — not automated by this repo.
