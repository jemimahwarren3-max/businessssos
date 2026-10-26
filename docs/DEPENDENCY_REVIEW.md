# Dependency review

Lockfile: `package-lock.json`. Install with `npm ci`.

## Stack (kept)

TanStack Start, React 19, Vite 8, Zod, Supabase JS, Paynow 2.2.2, Vitest, vite-plugin-pwa, idb, Upstash Redis client (optional).

## Audit (19 October 2026)

`npm audit --audit-level=high` reported 13 vulnerabilities (2 moderate, 6 high, 5 critical). Notable names: `fast-uri`, `js-yaml`, `seroval`, `source-map-js`, `brace-expansion`. `npm audit fix` crashed (`Cannot read properties of null (reading 'edgesOut')`). No force upgrade was applied.

CI prints the same audit with `continue-on-error: true` so the known unfixed tree does not pretend to be clean, and also does not block every PR until the installer bug is resolved.

## Follow-up (26 October 2026)

The direct dependency is now Zod 4.6.7, addressing the high-severity advisory
whose fixed range begins at 4.6.6. The migration updated the storefront RPC
schema helper to Zod 4's `ZodType<T>` type and changed test UUID fixtures to
RFC-compliant values, matching Zod 4's stricter `.uuid()` validation.

The low-severity serializer finding was resolved with a root npm override to
`serialize-javascript@^7.1.4`, which satisfies the existing
`@rollup/plugin-terser` range (`^7.0.3`) and requires Node 20 or newer. The
26 October local `npm audit --audit-level=high` reports zero vulnerabilities.
The CI dependency audit step is now blocking, but its remote result has not yet
been observed.

## Unused / heavy

Radix, recharts, excel readers, embla, vaul: used by the UI kit. Not removed in this pass.

## SBOM

Not generated.

## Policy

Make security-driven major upgrades only with explicit scope and full
compatibility validation. Do not add Redis/queues unless measurement says the
optional Upstash cache is insufficient.
