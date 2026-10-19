# BusinessOS implementation plan

## Goal of this increment

Make a first Cloud Run revision possible without wildcard DNS, extra product features, or touching production Postgres.

## Why not the rest of the 200

Variants, shopper Paynow, GRN, and media are not deploy blockers. Legal entity, CDPA, restore drills, and `npm audit` force-upgrades cannot be completed honestly from this agent.

## What this slice delivers

| Behaviour                                           | Where                                                   |
| --------------------------------------------------- | ------------------------------------------------------- |
| Path shop URLs unless `SHOP_HOSTS=true`             | `src/lib/storefront/host.ts`, server 308, merchant copy |
| Container listens on Cloud Run `PORT`               | `Dockerfile`                                            |
| Boot fails if required env is missing               | `src/lib/runtime-env.server.ts`                         |
| Manual GitHub deploy to Cloud Run (staging secrets) | `.github/workflows/deploy-cloud-run.yml`                |
| Operator runbook                                    | `docs/CLOUD_RUN_LAUNCH.md`                              |

## What it does not deliver

- A live GCP project, secrets, or a green revision (operator).
- Production SQL on `maidxfntfpnkcqnuhozo`.
- Wildcard shop hostnames.
- Customer Paynow.

## Acceptance criteria

1. `shopHostsEnabledFromOrigin` is false for `*.run.app` unless flagged on.
2. `publicStoreRedirect` does not 308 `/store/{slug}` when shop hosts are off.
3. `assertProductionRuntimeEnv` throws only in production when keys are missing.
4. Unit tests for the above pass.

## Tests

- `npx vitest run tests/storefront.test.ts tests/runtime-env.test.ts`
- `npx tsc --noEmit`

## Rollback

Leave `SHOP_HOSTS=true` unset. Revert the workflow if a bad image was pushed; Cloud Run traffic stays on the previous revision.
