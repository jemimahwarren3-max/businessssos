# Dependency review

Lockfile: `package-lock.json`. Install with `npm ci`.

## Stack (kept)

TanStack Start, React 19, Vite 8, Zod, Supabase JS, Paynow 2.2.2, Vitest, vite-plugin-pwa, idb, Upstash Redis client (optional).

## Audit (19 October 2026)

`npm audit --audit-level=high` reported 13 vulnerabilities (2 moderate, 6 high, 5 critical). Notable names: `fast-uri`, `js-yaml`, `seroval`, `source-map-js`, `brace-expansion`. `npm audit fix` crashed (`Cannot read properties of null (reading 'edgesOut')`). No force upgrade was applied.

CI prints the same audit with `continue-on-error: true` so the known unfixed tree does not pretend to be clean, and also does not block every PR until the installer bug is resolved.

## Unused / heavy

Radix, recharts, excel readers, embla, vaul: used by the UI kit. Not removed in this pass.

## SBOM

Not generated.

## Policy

No major-version upgrades in this stage. Do not add Redis/queues unless measurement says the optional Upstash cache is insufficient.
