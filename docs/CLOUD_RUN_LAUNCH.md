# Cloud Run deployment status

## Current status: deployment paused

GitHub Actions does not deploy the application to Cloud Run. The prior
workflow deployed the staging Supabase configuration to the `kwetuu` service
and mapped the production domain `mykwetuu.com`; that mixed-environment path
has been removed.

CI remains active on pull requests and pushes to `main` or `master`. It applies
the configured additive migrations to staging, runs tests, and builds the
application. Production Supabase is not migrated by CI. Existing Cloud Run
revisions and DNS mappings are not changed by this repository change; this
pause prevents future GitHub Actions deployments from updating them.

Do not manually deploy this application to the production domain until the
environment separation and release checks below are complete.

## Requirements before deployment resumes

- Create distinct GitHub Actions environments for `staging` and `production`.
- Use separate Cloud Run services and environment-scoped credentials.
- Confirm each service's build-time `VITE_SUPABASE_*` settings and runtime
  `SUPABASE_*` settings refer to the same environment.
- Forward server-only provider secrets such as `GEMINI_API_KEY` only to the
  intended runtime; never expose them as `VITE_*` build variables.
- Give staging and production distinct `APP_URL` values; only production may
  use `https://mykwetuu.com`.
- Protect production deployment with a restricted branch and required
  reviewer approval.
- Keep production database migrations behind a separate reviewed and approved
  operation. CI must continue targeting staging only.
- Add post-deployment health checks and document how to roll back to a known
  good Cloud Run revision.
- Verify payment webhooks, authentication redirects, mail delivery, and
  storefront domains separately for each environment.

Once these controls and the required environment-specific secrets are
verified, reintroduce a deployment workflow that selects the GitHub
environment explicitly. Do not reuse staging credentials or build settings
for production.
