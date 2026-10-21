# Feature audit (Kwetuu)

Stack that is already here (do not replace): **Vite 8 + React 19 + TanStack Start/Router + Tailwind 4 + shadcn/Radix + Lucide + sonner + TanStack Query/Table + Supabase JS + Paynow Node SDK**. There is no React Router v6 and no Next.js.

## What actually works in git

| Area                    | Status                                             | Routes / files                                                                                                        |
| ----------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Public marketing        | Stage 2: homepage, gallery, pricing, auth aliases  | `/`, `/stores`, `/pricing`, `/signup`, `/login`, `/features`, `/templates`, `/faq`, `/about`                          |
| Auth                    | Email + Google PKCE callback                       | `/auth`, `/auth/callback`, `/staff-login`, `/reset-password`                                                          |
| Marketplace             | Real published shops                               | `/stores` gallery; `/market` product search                                                                           |
| Onboarding              | Name → template → first product → pickup → publish | `/onboarding`                                                                                                         |
| Merchant OS             | Real CRUD via server fns + RLS                     | `/dashboard`, `/inventory`, `/sales`, `/storefront`, invoices, quotes, customers, expenses, reports, billing, team    |
| Public shop             | Real catalogue listings                            | `{slug}.mykwetuu.com` (internal `/store/$slug`); product, search, cart, checkout, order status                        |
| Cart                    | localStorage per slug until checkout               | `src/lib/storefront/cart.ts`                                                                                          |
| Shop Paynow             | Server-side `paynow` package                       | `src/lib/payments/shop-paynow.server.ts`, webhook `POST /api/webhooks/paynow` in `src/server.ts`                      |
| Platform billing Paynow | Separate keys                                      | `src/lib/payments/paynow.server.ts`                                                                                   |
| Ten templates           | One catalogue, ten layouts                         | Distinct chrome/homepage per layout in `store-experience.tsx`. IDs unchanged. Shop header is the shop, not `/market`. |
| Tenant isolation tests  | Staging                                            | `tests/integration/tenant-isolation.test.ts`                                                                          |

Protected merchant routes: `_authenticated/route.tsx` redirects unauthenticated users to `/auth?mode=signin`.

## Guide route aliases

| Guide                 | Existing            | Action                                                                       |
| --------------------- | ------------------- | ---------------------------------------------------------------------------- |
| `/stores`             | `/market`           | `/stores` is the published-shop gallery. `/market` still searches products.  |
| `/signup`             | `/auth?mode=signup` | Redirect.                                                                    |
| `/login`              | `/auth?mode=signin` | Redirect.                                                                    |
| `/dashboard/products` | `/inventory`        | Keep inventory. Do not add a second products app.                            |
| `/dashboard/store`    | `/storefront`       | Keep.                                                                        |
| `/store/:handle`      | `{slug}.host`       | Public URL is the shop subdomain. `/store/$slug` is rewrite + draft preview. |

## What is stub / incomplete vs the guide

- **Live Cloud Run** still an older image: `/features` 404, homepage title BusinessOS AI, no Google button. Last successful deploy was the kwetuu-cloud-run branch, not this stack.
- **Shop subdomains** need `*.mykwetuu.com` DNS plus TLS (Cloudflare on `*` or an HTTPS load balancer). Cloud Run domain-mappings cannot bind a wildcard. `.run.app` still uses `/store/{slug}`.
- **Email sign-up** on staging Auth: GoTrue `email_provider_disabled`. Google is enabled in the project; UI for Google is in PR #26, not live.
- **Confirm email** will fail until Supabase SMTP is set; keep it off for beta.
- **Ten templates** are layout variants of one React tree, not ten folders under `src/templates/`. Do not split them into a second data layer.
- **Product variants as SKUs** are not in the schema. Size/colour is description text.
- **Paynow** is Cloud Run + service role, not Supabase Edge Functions. Do not add `supabase/functions/initiate-payment` unless asked; the webhook already exists.
- **Realtime new-order toast** is not wired; orders load on query.
- **Concurrent oversell** is intended to be locked in SQL on reserve; needs a live two-buyer test (Stage 7).
- **Images >5MB**: product media PR exists (#24); not on this branch.
- Merchant dashboard titles still say BusinessOS on many inner pages.

## Stage 2 (public site)

Homepage `/` and `/stores` load `getMarketplaceFn`. Featured and gallery cards are published shops from the database, or an empty state — never hardcoded demo shops. `/pricing` compares founding beta ($0) with Pro (`PLAN_MONTHLY_USD.pro` after notice). `/signup` and `/login` still redirect to `/auth`. `/market` remains product search.

## Do not rebuild

Do not clone vercel/commerce, Medusa, Falcolee, Mosaic, or Storefront UI into this repo. Copy layout ideas only. Do not install Stripe. Do not switch router. Do not create a new Supabase project.
