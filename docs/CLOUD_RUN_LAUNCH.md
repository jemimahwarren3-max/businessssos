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

## One-time GCP setup (CLI, not console)

Install the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install),
log in, then:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
export GCP_PROJECT_ID=YOUR_PROJECT_ID
export GCP_REGION=europe-west1
export SESSION_SECRET='at-least-32-characters-of-random'
export SUPABASE_SERVICE_ROLE_KEY='staging-service-role'
# optional mail:
# export RESEND_API_KEY=re_...
# export MAIL_FLUSH_SECRET='at-least-16-chars'
chmod +x scripts/gcloud-bootstrap.sh
./scripts/gcloud-bootstrap.sh
```

The script enables APIs, creates the `kwetuu` Artifact Registry repo, the
GitHub deploy account, the Cloud Run runtime account, and Secret Manager
entries. It prints the remaining GitHub secret names.

Google orgs often block JSON keys (`iam.disableServiceAccountKeyCreation`).
Use Workload Identity Federation instead — no file to download. See the
console steps in the operator reply / GitHub secrets table below.

## GitHub Actions secrets

| Secret                             | Value                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `GCP_PROJECT_ID`                   | The GCP project id                                                                     |
| `GCP_WORKLOAD_IDENTITY_PROVIDER`   | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/kwetuu/providers/github` |
| `GCP_SERVICE_ACCOUNT`              | `kwetuu-github@PROJECT_ID.iam.gserviceaccount.com`                                     |
| `APP_URL`                          | Always `https://mykwetuu.com` (do not flip to `.run.app`)                              |
| `STAGING_SUPABASE_URL`             | Staging project URL                                                                    |
| `STAGING_SUPABASE_PUBLISHABLE_KEY` | Staging anon/publishable key                                                           |
| `STAGING_SUPABASE_PROJECT_ID`      | `slajanbsfqjnuuiohbmg`                                                                 |
| `NOTIFY_FROM_EMAIL`                | Optional. e.g. `Kwetuu <alerts@mykwetuu.com>` after Resend verifies the domain         |
| `MAIL_FLUSH_SECRET`                | Optional. 16+ characters, same value as Secret Manager                                 |

## Domain `mykwetuu.com`

Keep GitHub `APP_URL` as `https://mykwetuu.com` from now on. The deploy job
maps `mykwetuu.com` and `www.mykwetuu.com` onto service `kwetuu` and prints
the DNS records. Fully managed Cloud Run needs `gcloud beta run
domain-mappings` (`--region` is not valid on the GA Anthos command).

1. Run **Actions → Deploy Cloud Run** (or merge to `master`).
2. Open the job log **Map mykwetuu.com**. Copy `TYPE` / `HOST` / `VALUE`.
3. At the registrar (or Cloudflare **DNS only**, grey cloud — not proxied),
   add those records for the apex and `www`.
4. Wait until the log’s certificate condition is `True` (often 15–60 minutes,
   sometimes longer). Then `https://mykwetuu.com` is the public URL.
5. In **staging** Supabase → Authentication → URL Configuration:
   Site URL `https://mykwetuu.com`. Redirect URLs: `https://mykwetuu.com/**`
   and `https://www.mykwetuu.com/**`.

Keep `SHOP_HOSTS=false` until you have a wildcard certificate. Paynow
`resulturl` is `https://mykwetuu.com/api/webhooks/paynow`.

## After deploy

- `GET https://mykwetuu.com/health` (or the `.run.app` URL before DNS)
- Sign in, open `/market`, open `/store/{a-published-slug}`
- Mail stays queued until `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL` exist
- Auth confirm/reset still use **Supabase Auth SMTP**
- Apply pending git migrations on **staging** only, including audit/receipts SQL if they are not there yet

## Honest first launch

| Included                               | Not included                             |
| -------------------------------------- | ---------------------------------------- |
| Merchant app, POS, stock, invoices     | Product variants                         |
| Public shops at `/store/{slug}`        | `{slug}.mykwetuu.com` until wildcard DNS |
| Guest checkout, pay on pickup/delivery | InnBucks                                 |
| Shopper accounts                       | Production Postgres until you approve it |

Paynow, Groq, Redis, Sentry, and Resend are optional for boot.
