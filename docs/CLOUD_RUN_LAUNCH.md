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

Create the GitHub key once:

```bash
gcloud iam service-accounts keys create github-kwetuu.json \
  --iam-account="kwetuu-github@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
```

## GitHub Actions secrets

| Secret                             | Value                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `GCP_PROJECT_ID`                   | The GCP project id                                                                     |
| `GCP_SA_KEY`                       | Full JSON of `github-kwetuu.json`                                                      |
| `APP_URL`                          | First: the `https://….run.app` URL Cloud Run prints. After DNS: `https://mykwetuu.com` |
| `STAGING_SUPABASE_URL`             | Staging project URL                                                                    |
| `STAGING_SUPABASE_PUBLISHABLE_KEY` | Staging anon/publishable key                                                           |
| `STAGING_SUPABASE_PROJECT_ID`      | `slajanbsfqjnuuiohbmg`                                                                 |
| `NOTIFY_FROM_EMAIL`                | Optional. e.g. `Kwetuu <alerts@mykwetuu.com>` after Resend verifies the domain         |
| `MAIL_FLUSH_SECRET`                | Optional. 16+ characters, same value as Secret Manager                                 |

Delete `github-kwetuu.json` after it is stored in GitHub.

## Domain `mykwetuu.com`

1. Merge this PR (or run **Deploy Cloud Run** once) so service `kwetuu` exists.
2. Map the hostname (Cloud Run prints the DNS records):

```bash
gcloud run domain-mappings create --service=kwetuu --domain=mykwetuu.com --region=europe-west1
gcloud run domain-mappings create --service=kwetuu --domain=www.mykwetuu.com --region=europe-west1
```

3. At the registrar for `mykwetuu.com`, add those A/AAAA or CNAME records.
4. Wait until `gcloud run domain-mappings describe --domain=mykwetuu.com --region=europe-west1` shows a Ready certificate.
5. Set GitHub secret `APP_URL` to `https://mykwetuu.com` and run **Deploy Cloud Run** once more (or merge any follow-up) so cookies and Paynow callbacks use the apex.
6. In the **staging** Supabase Auth URL settings, add `https://mykwetuu.com` and `https://www.mykwetuu.com` as site/redirect URLs.

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
