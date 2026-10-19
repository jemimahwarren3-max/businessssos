# Cloud Run launch (what is actually required)

This is the deploy path. It is not the 200-feature roadmap. Variants, shopper Paynow, GRN, file uploads, and fiscalisation are not required to put the current POS and shops on a URL.

## Honest first launch

| Included                                             | Not included                                |
| ---------------------------------------------------- | ------------------------------------------- |
| Merchant app, POS, stock, invoices                   | Product variants                            |
| Public shops at `/store/{slug}`                      | `{slug}.domain` until you add wildcard DNS  |
| Guest checkout, pay on pickup/delivery, quotes       | EcoCash / merchant Paynow                   |
| Shopper accounts                                     | Shopper emails                              |
| Platform Paynow for the $3 Pro plan, if keys are set | Collecting shopper money with platform keys |

Database for the first revision: **staging** `slajanbsfqjnuuiohbmg`. Production `maidxfntfpnkcqnuhozo` stays untouched until a human applies storefront migrations there.

## Code already in this repo

- Dockerfile listens on `PORT` (Cloud Run default 8080).
- `SHOP_HOSTS=false` keeps shops on `/store/{slug}` so `*.run.app` works.
- Production boot fails if `APP_URL`, `SESSION_SECRET`, and the three Supabase keys are missing.
- `GET /health` returns `ok`.
- GitHub Action: **Actions → Deploy Cloud Run → Run workflow**.

## Operator checklist (cannot be done from this agent)

1. GCP project, Cloud Run API, Artifact Registry API, and a Docker repo:

   `gcloud artifacts repositories create businessos --repository-format=docker --location=us-central1`

2. Service account that can push images and deploy Cloud Run. Put the JSON key in GitHub `GCP_SA_KEY`. Put the project id in `GCP_PROJECT_ID`.
3. GitHub secrets: `STAGING_APP_URL` (the Cloud Run URL, `https://….run.app` with no trailing slash), `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_PUBLISHABLE_KEY`, `STAGING_SUPABASE_PROJECT_ID`.
4. Secret Manager in that GCP project: `SESSION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`. Grant the Cloud Run runtime service account access.
5. Apply pending git migrations on **staging** (through `20261019210000_shopper_accounts.sql`) if they are not already there.
6. After deploy: `GET https://YOUR_URL/health`, sign in, open `/market`, open `/store/{a-published-slug}`.
7. Wildcard DNS (`*.yourdomain.com`) and `SHOP_HOSTS=true` (rebuild) only after a certificate exists. Do not set that flag on a raw `.run.app` URL.
8. Production database, legal entity on `/privacy` and `/terms`, backup restore, and `npm audit` upgrades remain separate human gates.

Paynow, Groq, Resend, Redis, and Sentry are optional. The app runs without them; Pro billing, the assistant, and email copies stay off until those keys are set.
