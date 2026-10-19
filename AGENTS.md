# Agent instructions for BusinessOS

This is a live merchant application, not a greenfield rewrite. Read the repository before changing architecture. Preserve working POS, stock, sales, auth, reporting, storefront, and marketplace behaviour.

## Stack

TanStack Start (React 19, Vite 8, Nitro node-server), Tailwind 4, Zod, Vitest, Supabase Auth and Postgres. Official deploy is Cloud Run. Render is temporary.

## Non-negotiable rules

1. Audit before large changes. Do not rebuild the app from scratch.
2. Do not replace real records with mock data, fake charts, or dead buttons.
3. Never trust browser prices, stock, discounts, payment status, or permissions.
4. Schema changes go through versioned SQL in `supabase/migrations/`. Do not drop tables or reset data.
5. Tenant isolation is database-enforced. Do not disable RLS. Staff of one business must not read another by changing a URL.
6. Online orders must not call `create_sale` until a merchant records payment. Unpaid orders are not revenue.
7. Platform Paynow keys bill BusinessOS subscriptions only. Do not collect customer shop funds with those keys.
8. Payment success comes from a trusted provider verification path, never from a browser redirect.
9. Retry-safe operations: checkout, webhooks, stock movements, and notifications must be idempotent.
10. Do not invent legal compliance, verification badges, reviews, popularity, or delivery times.
11. Do not put secrets, service-role keys, or payment credentials in the client bundle or logs.
12. UI copy must not use em dashes. Page titles use ` | BusinessOS AI`.
13. Staging project `slajanbsfqjnuuiohbmg` is the only database an agent may migrate unless a human explicitly approves production `maidxfntfpnkcqnuhozo`.
14. Complete vertical slices. Mark unavailable features honestly. Do not claim an integration works unless it is implemented and tested.

## Where logic lives

- Domain and validation: `src/lib/` (storefront under `src/lib/storefront/`).
- Money, stock, and orders: Postgres security-definer functions.
- Public catalogue: security-definer RPCs, never the service role and never a direct `products` select for shoppers.
- Merchant UI: `src/routes/_authenticated/`.
- Public shops: `{slug}.{APP_URL host}` rewritten to `/store/$slug`.

## Checks

- `npx tsc --noEmit`
- `npm test`
- `npm run lint`
- `npx vitest run tests/integration/tenant-isolation.test.ts` when `SUPABASE_ACCESS_TOKEN` is present

A feature is done only when database, server, UI, permissions, errors, and tests work together.

See `SECURITY.md`, `CONTRIBUTING.md`, `docs/KNOWN_LIMITATIONS.md`, and `docs/BUSINESSOS_IMPLEMENTATION_PLAN.md`.
