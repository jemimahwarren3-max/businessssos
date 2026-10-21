# Environment setup

`README.md` is still the original product prompt. Use this file to run the app.

## Node

Node 20 or 22. `npm ci` then `npm run dev` (port 8080).

## Env files

Copy `.env.example` to `.env`. Use `npm run env:staging` or `env:production` to switch the Supabase pair. This agent and CI must use **staging** unless the operator explicitly asks for production.

Required: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, matching `VITE_*`, `SESSION_SECRET`, `APP_URL`.

Server-only: `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `PAYNOW_*`, `RESEND_API_KEY`, `MAIL_FLUSH_SECRET`.

Optional: Redis, Sentry DSN, `PLATFORM_ADMIN_USER_ID`, `NOTIFY_FROM_EMAIL`.

`VITE_*` values are public by design. Never prefix the service role.

## Shop hosts in development

`APP_URL=http://localhost:8080` makes shops `http://{slug}.localhost:8080`. Vite `allowedHosts` is open for that. Preview stays on `http://localhost:8080/store/{slug}?preview=1`.

## Database

Migrations live in `supabase/migrations/`. Staging already has storefront, marketplace browse, and reserved host slugs. Production does not, unless the operator applies them.

## Cloud Run

See `CLOUD_RUN_LAUNCH.md`, `DEPLOYMENT_AND_ROLLBACK.md`, and `Dockerfile`. Build args must include the VITE Supabase values. First deploy uses staging, shop subdomains (`SHOP_HOSTS=true`), service `kwetuu` in `europe-west1`, domain `mykwetuu.com`. Merged PRs on `master` deploy after CI. Do not use the GCP Create service console.

## Tests

`npm test` for unit tests. Integration tests need `SUPABASE_ACCESS_TOKEN` (account token, not the DB password).
