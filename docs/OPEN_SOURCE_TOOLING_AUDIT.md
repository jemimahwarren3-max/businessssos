# Open-source tooling audit

Audited 19 October 2026 on `cursor/open-source-tooling-dafe` (includes the storefront, marketplace, production-readiness, and order-rules work). Licences were checked against npm metadata and project sites. This is not legal advice.

**Decision:** keep the existing TanStack Start + Supabase commerce backend. Do not add Medusa, Saleor, WooCommerce, Meilisearch, Umami, Storybook, n8n, or MinIO in this pass.

## Existing tools and their purpose

| Tool | Already in repo | Licence (as published) | What BusinessOS uses it for |
|---|---|---|---|
| TanStack Start, Router, Query | Yes | MIT | App shell, routing, server functions, merchant data fetching |
| React 19 / Vite 8 | Yes | MIT | UI and build |
| Tailwind CSS 4 | Yes | MIT | Merchant app and storefront layouts |
| shadcn/ui (New York) + Radix | Yes (`components.json`, `src/components/ui`) | MIT (copy-in components) | Buttons, dialogs, forms primitives, sidebar, tables markup |
| Lucide | Yes `lucide-react` | ISC | Icons |
| React Hook Form + `@hookform/resolvers` | Installed; **unused in routes until this change** | MIT | Now used for Add product |
| Zod | Yes | MIT | Server functions, SQL payload parsing, business schemas |
| Vitest | Yes | MIT | Unit tests |
| Supabase JS + Postgres RLS | Yes | Apache-2.0 client; hosted Postgres | Auth, tenant data, RPCs |
| Paynow npm client | Yes | Check package; commercial API | Platform **subscription** billing only |
| Recharts | Yes | MIT | Insights charts from real records |
| date-fns, cmdk, vaul, embla, CVA, clsx | Yes | MIT | Dates, command palette, drawers, carousel, class names |
| Sentry / Upstash Redis | Optional env | Proprietary hosted | Errors and workspace cache when configured |
| zxing | Yes | MIT / Apache | Barcode camera lookup |
| PWA (vite-plugin-pwa / Workbox) | Yes | MIT | Authenticated offline shell only |

Marketplace search today is `ILIKE` inside `browse_marketplace` (`20261019110000_marketplace_browse.sql`). It only returns published shops with `marketplace_visible`. That is enough at current catalogue size.

Ten storefront templates already live in `src/lib/storefront/templates.ts` plus one renderer. They are distinct layouts, not a Storybook project.

## Recommended (adopt or keep)

1. **Keep** shadcn/ui, Tailwind, Lucide, Zod, Vitest, Supabase. Installing second copies would be waste.
2. **Adopt `@tanstack/react-table` 8.21.3 (MIT).** Headless table on top of the existing shadcn `Table` markup. Used for inventory and storefront product lists (sort by name, price, stock). No new database.
3. **Start using React Hook Form** on the Add product dialog, validated with the existing `productSchema`. Do not rewrite every form in one pass.
4. **Keep Postgres search.** Add Meilisearch only after published listings are large enough that `ILIKE` is slow or ranking is poor. Indexing must stay a projection of the same RPCs, never a second source of truth.
5. **Add Playwright later** in CI with a dedicated job, once a stable preview URL and test merchant exist. Do not download browsers into the default `npm test` path yet.

## Rejected (this pass)

| Tool | Why |
|---|---|
| **Medusa** | Second commerce engine and usually a second database. Would fork products, carts, orders, and payments away from Supabase RLS and `create_sale` / `store_orders`. Zimbabwe cash rules and shared POS stock would have to be re-implemented as Medusa modules. Cost: hosting, sync, backups, dual auth. |
| **Saleor** | Python/Django + GraphQL. Incompatible with this TypeScript Start app without a rewrite. |
| **WooCommerce** | WordPress PHP store. Cannot host the existing POS, staff roles, or multi-tenant RLS. |
| **Meilisearch** | Useful later. Needs a host, API keys, reindex jobs, and a guarantee that unpublished products never enter the index. Operating cost is not zero. |
| **Umami** | Needs a database and a host. No first-party analytics requirement until shops have real traffic. Do not add trackers without a privacy review. |
| **Storybook** | Duplicates template preview already on `/storefront` and `?preview=1`. Extra pipeline to keep in sync. |
| **dnd-kit** | No drag-and-drop section editor exists yet. Adding it now is UI-only. |
| **n8n** | Source-available (Sustainable Use), not OSI. Workflows would sit outside the order state machine. |
| **MinIO** | No object-storage product yet (image URLs are text). Extra cluster to patch. |

## Architecture comparison if someone still wants Medusa

| Concern | Stay on Supabase (current) | Move commerce to Medusa |
|---|---|---|
| Source of truth | `products.stock`, `sales`, `store_orders` | Medusa DB plus a sync to POS |
| Tenant isolation | Postgres RLS + membership RPCs | Medusa multi-tenancy plus mapping BusinessOS `business_id` |
| Auth | Supabase Auth cookie | Duplicate customer/merchant identity or a brittle bridge |
| Payments | Platform Paynow isolated; shop cash rules in SQL | Medusa payment provider plugins; still must write Paynow yourself |
| Migration | None | Export catalogue, orders, rebuild checkout, dual-run, rollback dump |
| Benefit | Already shipping | Faster generic cart only if we threw away POS |

No benefit demonstrated. **Do not migrate.**

## Integration plan (done vs next)

**This change**

- Audit document (this file).
- `@tanstack/react-table` + `src/components/data-table.tsx`.
- Inventory desktop list and storefront product list use it.
- Add product uses React Hook Form + Zod.

**Later, still inside this architecture**

- Same `DataTable` on sales history and expenses when those screens hurt.
- Playwright smoke: guest checkout cannot mark Paynow paid; cashier cannot open another tenant.
- `pg_trgm` indexes on product name if marketplace `ILIKE` shows up in logs.
- Umami only with a documented operator, no cookies beyond what legal pages allow.

## Dependencies and security

- New runtime dependency: `@tanstack/react-table@8.21.3` (MIT, React peer already satisfied).
- `npm audit` still reports 13 issues in the lockfile from earlier; this package is not a known replacement for those. Do not run a reckless `npm audit fix`.
- No new hosted credentials.
- Table sorting is client-side on rows already returned by tenant-scoped RPCs. It cannot reveal another merchant's stock.
- Form validation still re-runs on the server (`addProduct` / `productSchema`).

## Test results

Recorded in the PR after commands run: `npx tsc --noEmit`, `npx vitest run tests/product-form.test.ts tests/storefront.test.ts`, `npm run lint`, and `npm run build` if the environment can complete it.

## Remaining blockers

- Playwright needs browsers, secrets, and a running app. Not added here.
- Customer Paynow, Meilisearch hosting, and analytics hosting are operator decisions.
- Staging `locations` schema drift is unrelated and still unresolved.
