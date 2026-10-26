# Dependency security

**Lockfile:** `package-lock.json` (npm). **Install:** `npm ci` in CI and deploy.

## Scanning

| Tool | Command | Purpose |
|------|---------|---------|
| npm audit | `npm audit` | Known CVEs in dependency tree |
| Manual review | `docs/DEPENDENCY_REVIEW.md` | Major upgrades and licence notes |

## Current priorities (26 Oct 2026)

1. **TanStack Start GHSA-qx66-fv34-fjm8 — patched in repository.**
   `@tanstack/react-start@1.168.60` and `@tanstack/start-server-core@1.169.39`
   are the patched versions. The aligned set is installed, `npm audit` reports
   zero vulnerabilities, and local type-check/tests/build pass. Production
   deployment remains unverified. Details: `../TANSTACK_GHSA_UPGRADE.md`.

2. `npm audit --audit-level=high` and the full `npm audit` report zero
   vulnerabilities on 26 October 2026. Re-run after lockfile changes and review
   dependency advisories during routine maintenance.

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
