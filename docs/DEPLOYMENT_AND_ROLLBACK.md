# Deployment and rollback

Official production host: **Google Cloud Run**. `render.yaml` stays for the temporary Render service. Do not treat a green Render deploy as the long-term production posture.

## Environments

| Name       | Git                   | Database               | Compute                                                                      |
| ---------- | --------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| Local      | any                   | staging URL in `.env`  | `npm run dev` port 8080                                                      |
| Staging    | pull requests/main    | `slajanbsfqjnuuiohbmg` | CI migration, test, and build verification; Cloud Run deployment is paused   |
| Production | `master` after review | `maidxfntfpnkcqnuhozo` | Deployment paused until distinct production configuration and approval gates |

Never apply storefront or marketplace SQL to production without explicit operator approval.

## Cloud Run build

`Dockerfile` is a two-stage Node 22 image. `VITE_*` and `APP_URL` are build args (inlined). Runtime env: `SUPABASE_*`, `SESSION_SECRET`, `PAYNOW_*`, `GROQ_*`, `PLATFORM_ADMIN_USER_ID`, optional Redis and Sentry, `APP_URL`.

Cloud Run injects `PORT`. The container listens on `HOST=0.0.0.0`.

Cloud Run deployment is currently paused. Do not use an operator-run command
or a GitHub Action to deploy staging configuration to the production service.
See `CLOUD_RUN_LAUNCH.md` for the required separation and release controls.

## Custom domains and shops

The intended production shop URLs are `https://{slug}.mykwetuu.com`;
`/store/{slug}` 308s there except draft preview. Do not route a staging
deployment to the production domain. Cloud Run domain mapping binds one
hostname, so `*.mykwetuu.com` needs wildcard DNS plus Cloudflare or an HTTPS
load balancer.

Paynow `resulturl` must be `https://mykwetuu.com/api/webhooks/paynow` on the apex, not a shop host.

## CI

`.github/workflows/ci.yml` runs on `master`, `main`, and every pull request:
`npm ci`, `tsc`, lint, tests, and a production build. CI applies additive
migrations to staging only. Cloud Run deployment is paused pending environment
separation. `npm audit --audit-level=high` is reported and does not fail the
job until those advisories are actually patchable.

## Rollback

1. Cloud Run: traffic to the previous revision after deployment is resumed.
2. Database: do not automatically reverse storefront migrations if live orders exist. Restore from encrypted dump into a safe project first.
3. Recurring invoices GitHub Action uses the production service role. Disable the workflow if a bad deploy is looping.

## Smoke after deploy

- `GET /health`
- Sign-in on the apex
- `GET /market`
- One shop hostname if DNS exists
- Paynow webhook URL reachable (does not prove a payment)

A deployment is not successful until those checks are actually run against the
intended environment URL.
