# Environment setup

`README.md` is still the original product prompt. Use this file to run the app.

## Node

Node 20 or 22. `npm ci` then `npm run dev` (port 8080).

## Env files

Copy `.env.example` to `.env`. Use `npm run env:staging` or `env:production` to switch the Supabase pair. This agent and CI must use **staging** unless the operator explicitly asks for production.

Required: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, matching `VITE_*`, `SESSION_SECRET`, `APP_URL`.

Server-only: `SUPABASE_SERVICE_ROLE_KEY`, `AI_PROVIDER` (`gemini` or `groq`; when both API keys exist the app defaults to Groq unless set), `GEMINI_API_KEY`, `GROQ_API_KEY`, optional `AI_DAILY_LIMIT_*` caps, `PAYNOW_INTEGRATION_*` (USD) and `PAYNOW_INTEGRATION_*_ZIG` (ZiG/ZWG subscription checkout), `RESEND_API_KEY`, `MAIL_FLUSH_SECRET`.

When turning on paid enforcement, set **`BILLING_ENABLED=true`** on Cloud Run **and** run once on the production database:

```sql
update public.platform_runtime set billing_enforced = true, updated_at = now() where id = 1;
```

Keep `billing_enforced = false` on staging while the free beta continues there.
AI assistance is review-first: it can suggest changes and prepare drafts, but the user must apply,
save, send, or publish them. See `AI_BUSINESS_COPILOT.md` for workflows and data sharing.

Optional: Redis, Sentry DSN, `PLATFORM_ADMIN_USER_ID`, `NOTIFY_FROM_EMAIL`.
Transactional emails stay queued unless Resend is configured with `RESEND_API_KEY`
and `NOTIFY_FROM_EMAIL`; scheduled delivery also needs `MAIL_FLUSH_SECRET` and
the GitHub Actions mail-flush workflow. The Cloud Run launch guide documents
the verified sender and staging test steps.

`VITE_*` values are public by design. Never prefix the service role.

## Shop hosts in development

`APP_URL=http://localhost:8080` makes shops `http://{slug}.localhost:8080`. Vite `allowedHosts` is open for that. Preview stays on `http://localhost:8080/store/{slug}?preview=1`.

## Database

Migrations live in `supabase/migrations/`. Staging already has storefront, marketplace browse, and reserved host slugs. Production does not, unless the operator applies them.

## Cloud Run

See `CLOUD_RUN_LAUNCH.md`, `DEPLOYMENT_AND_ROLLBACK.md`, and `Dockerfile`. Build args must include the VITE Supabase values. First deploy uses staging, shop subdomains (`SHOP_HOSTS=true`), service `kwetuu` in `europe-west1`, domain `mykwetuu.com`. Merged PRs on `master` deploy after CI. Do not use the GCP Create service console.

## Tests

`npm test` for unit tests. Integration tests need `SUPABASE_ACCESS_TOKEN` (account token, not the DB password).
