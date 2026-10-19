# Deployment and rollback

Official production host: **Google Cloud Run**. `render.yaml` stays for the temporary Render service. Do not treat a green Render deploy as the long-term production posture.

## Environments

| Name | Git | Database | Compute |
|---|---|---|---|
| Local | any | staging URL in `.env` | `npm run dev` port 8080 |
| Staging | feature branches | `slajanbsfqjnuuiohbmg` | optional Cloud Run staging service |
| Production | `master` after review | `maidxfntfpnkcqnuhozo` | Cloud Run |

Never apply storefront or marketplace SQL to production without explicit operator approval.

## Cloud Run build

`Dockerfile` is a two-stage Node 22 image. `VITE_*` and `APP_URL` are build args (inlined). Runtime env: `SUPABASE_*`, `SESSION_SECRET`, `PAYNOW_*`, `GROQ_*`, `PLATFORM_ADMIN_USER_ID`, optional Redis and Sentry, `APP_URL`.

Cloud Run injects `PORT`. The container listens on `HOST=0.0.0.0`.

Example (operator-run, project-specific):

```
gcloud run deploy businessos \
  --source . \
  --region REGION \
  --allow-unauthenticated \
  --set-env-vars APP_URL=https://yourdomain.com,...
```

`--allow-unauthenticated` is required for a public shop. IAM still does not replace app auth.

See `CLOUD_RUN_LAUNCH.md` for the first-revision checklist and GitHub Action.

## Custom domains and shops

`SHOP_HOSTS=false` (Cloud Run default) keeps shops at `https://{APP_URL host}/store/{slug}` and does not 308 to a subdomain. Set `SHOP_HOSTS=true` and rebuild only when a wildcard certificate exists. Cloud Run domain mapping binds one hostname; `{slug}.run.app` is not available.

Paynow `resulturl` must be `https://yourdomain.com/api/webhooks/paynow` on the apex, not a shop host.

## CI

`.github/workflows/ci.yml` runs on `master`, `main`, and every pull request: `npm ci`, `tsc`, lint, tests, production build. `npm audit --audit-level=high` is reported and does not fail the job until those advisories are actually patchable (`npm audit fix` currently crashes).

## Rollback

1. Cloud Run: traffic to the previous revision.
2. Database: do not automatically reverse storefront migrations if live orders exist. Restore from encrypted dump into a safe project first.
3. Recurring invoices GitHub Action uses the production service role. Disable the workflow if a bad deploy is looping.

## Smoke after deploy

- `GET /health`
- Sign-in on the apex
- `GET /market`
- One shop hostname if DNS exists
- Paynow webhook URL reachable (does not prove a payment)

A deploy is not successful until those checks are actually run against the live URL.
