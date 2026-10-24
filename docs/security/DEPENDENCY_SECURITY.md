# Dependency security

**Lockfile:** `package-lock.json` (npm). **Install:** `npm ci` in CI and deploy.

## Scanning

| Tool | Command | Purpose |
|------|---------|---------|
| npm audit | `npm audit` | Known CVEs in dependency tree |
| Manual review | `docs/DEPENDENCY_REVIEW.md` | Major upgrades and licence notes |

## Current priorities (Oct 2026)

1. **Critical — TanStack Start** GHSA-qx66-fv34-fjm8: upgrade `@tanstack/react-start` to ≥1.169.4 with aligned plugin packages; **do not merge** until `npm run build` passes. Details: `../TANSTACK_GHSA_UPGRADE.md`.

2. **High — axios** (transitive, e.g. Paynow SDK): track upstream; no blind major bump without integration test.

3. **Moderate — vitest** (@vitest/mocker): dev-only; patch on schedule.

## Supply chain practices

- CI uses `npm ci` from lockfile.
- Deploy uses Workload Identity Federation (no long-lived GCP JSON keys in repo).
- GitHub Actions secrets scoped to deploy job; PRs from forks do not receive secrets.

## SBOM

Not generated automatically. Optional future: `npm sbom --omit dev` in CI artifact.

## Upgrade policy

1. Security patch: branch, test, merge.
2. Minor: weekly review.
3. Major: dedicated task with build + storefront smoke.

Record upgrades in `SECURITY_REMEDIATION_LOG.md` when they close a finding.
