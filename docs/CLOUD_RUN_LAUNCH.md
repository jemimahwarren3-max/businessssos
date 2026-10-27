# Cloud Run launch (Kwetuu, mykwetuu.com)

Do **not** use the GCP “Create service” screen (Developer Connect / Cloud
Build from the console). GitHub already deploys: a merged PR on `master`
runs CI, then `gcloud run deploy kwetuu` in europe-west1.

Database for this first revision: **staging** `slajanbsfqjnuuiohbmg`.
Production Postgres `maidxfntfpnkcqnuhozo` stays untouched until you
explicitly apply migrations there.

Shops stay at `https://mykwetuu.com/store/{slug}`. Wildcard
`{slug}.mykwetuu.com` is a later DNS + certificate job (`SHOP_HOSTS=true`).

## What happens on a merged PR

1. Open a PR. `CI` runs tests and a production build. Nothing is deployed.
2. Merge to `master`. `CI` runs again on that commit.
3. If that job is green, the `deploy` job builds the Docker image, pushes it
   to Artifact Registry, and updates Cloud Run service `kwetuu`.
4. First time only, you can also **Actions → Deploy Cloud Run → Run workflow**.

Open PRs are not given their own URLs. Only `master` is live.

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
