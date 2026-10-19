# BusinessOS application audit

Audited 19 October 2026 on branch `cursor/order-rules-engine-dafe`, stacking storefront, marketplace, subdomains, and production-readiness work. This is a repository and test review. It is not a penetration test, a restore drill, or a legal opinion.

**Do not treat the 200-feature roadmap as a launch checklist.** Most retention features are intentionally missing. The product already has a working merchant back office plus a real (limited) public shop and marketplace.

Legend: **IV** implemented and covered by tests in this repo; **INV** implemented in code, not re-verified this session; **P** partial; **UI** screen or copy without the full workflow; **M** missing; **B** broken or insecure if used as advertised; **X** blocked on credentials, DNS, legal, or a provider.

## 1. What already exists

TanStack Start, Vite 8, React 19, Tailwind 4, Zod, Vitest, Supabase Auth + Postgres RLS, httpOnly sealed sessions, Google PKCE, optional MFA for platform admin.

Merchant app: products, stock movements, POS (online and queued offline), invoices, quotes, customers, suppliers, purchase orders, expenses, reports, roles, audit logs, data export, Pro subscription billing via platform Paynow, WhatsApp `wa.me` links.

Customer app: published shop on `{slug}.{host}`, ten templates, cart, server-priced checkout (pickup / priced delivery / quote), access-code order tracking, `/market` directory of shops that opted in.

Shared stock: POS `create_sale` and online `store_order` both update `products.stock`. Online orders do not book revenue until Record payment.

## 2. Highest-risk gaps (current)

| ID  | Sev | Gap                                                                                                                                     | Status |
| --- | --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| R1  | P1  | Customer Paynow / EcoCash not implemented. Honest if disclosed. Fraud if claimed.                                                       | X      |
| R2  | P1  | Staging `locations` schema is not in git. POS on drifted DBs can fail.                                                                  | IV     |
| R3  | P1  | Wildcard DNS/TLS for shop hosts is an operator task.                                                                                    | X      |
| R4  | P1  | `npm audit` reports high/critical transitive issues.                                                                                    | INV    |
| R5  | P1  | Backup restore has not been executed here.                                                                                              | X      |
| R6  | P1  | Order-rules migration `20261019140000_storefront_order_rules.sql` must be applied on staging before the new checkout rules take effect. | P      |
| R7  | P2  | Cut-off, prep minutes, and collection windows are displayed, not calendar-enforced.                                                     | IV     |
| R8  | P2  | Legal identity, CDPA, ZIMRA fiscalisation unanswered.                                                                                   | X      |
| R9  | P2  | No customer accounts or verified-merchant checks. Reviews are verified-purchase only.                                                   | P      |

No P0 unauthenticated payment-credit path was found. Platform Paynow confirmation RPCs were previously locked down.

## 3. Core 100 (serious operations)

### A. Business setup 1–10

| #   | Feature                           | Status | Notes                                                                                   |
| --- | --------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| 1   | Guided onboarding                 | P      | Business create exists; not a full wizard with hours and checklist reminders.           |
| 2   | Multiple businesses per account   | INV    | Memberships support it; UX is workspace switch, not a polished org picker.              |
| 3   | Business profiles                 | P      | Name, contact, logo-ish fields; no ownership verification.                              |
| 4   | Branches                          | P      | Default location is seeded. Extra locations can exist in SQL. No transfer UI.           |
| 5   | Settings, receipts, tax, payments | P      | Currency, tax on products, receipt fields exist; not a full tax engine.                 |
| 6   | Role-based access                 | IV     | owner/admin/manager/cashier/accountant + permissions table.                             |
| 7   | Staff invitations                 | INV    | Team page invites, activate/deactivate.                                                 |
| 8   | Activity log                      | INV    | `audit_logs` for many mutations.                                                        |
| 9   | Setup checklist                   | P      | Storefront checklist only.                                                              |
| 10  | Export, closure, recovery         | P      | Export exists. Account closure/admin delete exists. Recovery is documented, unrestored. |

### B. Products and inventory 11–20

| #   | Feature                            | Status | Notes                                                                                              |
| --- | ---------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| 11  | Catalogue                          | INV    | Name, description, SKU, category, image URL, prices.                                               |
| 12  | Variants                           | M      | Notes fields only. One stock row.                                                                  |
| 13  | Stock per branch                   | M      | Single `products.stock` in git.                                                                    |
| 14  | Stock reduction after sales        | IV     | `create_sale` FOR UPDATE; online orders reserve on `store_order`.                                  |
| 15  | Low-stock alerts                   | P      | Crossing the product threshold writes an in-app (and optional email) alert. Not a forecast engine. |
| 16  | Receiving, adjustments, write-offs | INV    | Inventory movements and reasons.                                                                   |
| 17  | Transfers between branches         | M      | Needs branches.                                                                                    |
| 18  | Barcode / SKU lookup               | P      | POS search and scanner library present; device-dependent.                                          |
| 19  | Bulk import/export                 | P      | Product import paths exist; not a full validated CSV report UX.                                    |
| 20  | Counts and discrepancies           | P      | Movements history; no dedicated count workflow.                                                    |

### C. POS 21–30

| #   | Feature                    | Status | Notes                                                                                 |
| --- | -------------------------- | ------ | ------------------------------------------------------------------------------------- |
| 21  | Fast POS                   | INV    | Phone/tablet/desktop sales page.                                                      |
| 22  | Cash and recorded methods  | INV    | cash/card/mobile_money/bank_transfer/credit.                                          |
| 23  | Discounts / overrides      | P      | Sale-level behaviour exists; not a full permissioned override matrix.                 |
| 24  | Receipts                   | INV    | Configurable-ish business info.                                                       |
| 25  | Hold / resume / cancel     | P      | Cancel exists; hold/resume not a first-class parked-sale model.                       |
| 26  | Returns / refunds          | INV    | Sale history refunds with audit.                                                      |
| 27  | Shift open/close           | P      | Time clock exists. Cash drawer is a separate till ledger.                             |
| 28  | Cash drawer recon          | M      |                                                                                       |
| 29  | Cashier discrepancy review | M      |                                                                                       |
| 30  | Offline sales queue        | P      | IndexedDB queue + sync; stock is an estimate while offline. Tests cover sync helpers. |

### D. Storefronts and marketplace 31–40

| #   | Feature                      | Status | Notes                                                                             |
| --- | ---------------------------- | ------ | --------------------------------------------------------------------------------- |
| 31  | Shareable merchant shops     | IV     | Subdomain + redirect.                                                             |
| 32  | Ten templates                | IV     | Distinct layouts, tested.                                                         |
| 33  | Visual editor                | P      | Logo colour banner typography fields; not a free-form page builder.               |
| 34  | Collections, search, filters | P      | Categories, search, sort. No merchandising collections.                           |
| 35  | Public marketplace           | IV     | `/market`, published + `marketplace_visible`.                                     |
| 36  | Auto publish/unpublish       | P      | Merchant publish and stock/availability on product pages. No scheduled unpublish. |
| 37  | Product pages                | INV    | Price, seller, availability label.                                                |
| 38  | Mobile cart/checkout         | INV    |                                                                                   |
| 39  | Preview, draft, schedule     | P      | Preview and publish. No schedule.                                                 |
| 40  | SEO / social / clean URLs    | P      | Titles, sitemap, shop hosts. Social images limited.                               |

### E. Orders and fulfilment 41–50

| #   | Feature                       | Status | Notes                                                                   |
| --- | ----------------------------- | ------ | ----------------------------------------------------------------------- |
| 41  | Order after checkout          | IV     | Idempotent `create_store_order`.                                        |
| 42  | Order states                  | IV     | pending confirmation through completed/cancelled/refunded-via-sale.     |
| 43  | Acceptance rules              | P      | This slice: `autoAccept` for eligible non-quote orders.                 |
| 44  | Prep, hours, cut-off, limits  | P      | Structured hours/windows/cut-off are enforced. Free-text notes are not. |
| 45  | Click and collect windows     | P      | Free-text windows, not a booking grid.                                  |
| 46  | Delivery options              | P      | Pickup, flat fee, areas text, or quote. No geo zones.                   |
| 47  | Automatic delivery fee        | P      | Flat fee and free-over. Quote-required blocks a fake fee.               |
| 48  | Address validation            | P      | Required string for delivery. No geocoder.                              |
| 49  | Minimum order                 | INV    | Enforced in `storefront_price_cart`.                                    |
| 50  | Cancel, substitutes, partials | P      | Cancel + stock restore before sale. No substitutions/partials.          |

### F. Payments 51–60

| #   | Feature                                | Status | Notes                                                                |
| --- | -------------------------------------- | ------ | -------------------------------------------------------------------- |
| 51  | Paynow (customer)                      | X      | Not built. Platform Paynow is subscriptions.                         |
| 52  | Merchant payment methods               | P      | Pickup, delivery, quote. Paynow flag forced false.                   |
| 53  | Explicit cash vs online policies       | P      | This slice.                                                          |
| 54  | Cash currencies / change               | P      | Stored, shown, snapshotted. Not denomination lists.                  |
| 55  | Currency labels                        | INV    | Business currency on prices and orders. No silent FX.                |
| 56  | Reconciliation                         | P      | Record payment writes sale+payment. No provider settlement file.     |
| 57  | Duplicate payment / webhook / order    | P      | Order idempotency + advisory lock. Customer webhooks N/A.            |
| 58  | Refunds, failures, disputes            | P      | POS refunds. No payment-provider disputes.                           |
| 59  | Net proceeds vs sales                  | P      | Reports separate expenses; unpaid online orders excluded from sales. |
| 60  | Financial exports / restricted reports | P      | Export and role checks exist.                                        |

### G. Customers 61–70

| #   | Feature                     | Status | Notes                                                          |
| --- | --------------------------- | ------ | -------------------------------------------------------------- |
| 61  | Guest checkout              | IV     |                                                                |
| 62  | Customer accounts / history | M      | Merchant `customers` table is B2B/shop CRM, not shopper login. |
| 63  | Consent-aware comms         | M      |                                                                |
| 64  | Order tracking              | INV    | Access code + honest unpaid copy.                              |
| 65  | Complaints                  | INV    | Order-token complaint form and merchant queue.                 |
| 66  | Merchant responses          | P      | Status transitions, not a thread.                              |
| 67  | Public policies             | INV    | Policies, hours, areas on the shop.                            |
| 68  | Verified reviews            | P      | Access-code reviews after ready/complete. No fake averages.    |
| 69  | Data access/deletion        | P      | Merchant export/delete. No shopper GDPR/CDPA self-service.     |
| 70  | Comms history ACL           | M      |                                                                |

### H. Suppliers and purchasing 71–80

| #   | Feature                            | Status | Notes                                                                                 |
| --- | ---------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| 71  | Supplier directory                 | INV    |                                                                                       |
| 72  | Purchase orders                    | INV    |                                                                                       |
| 73  | Goods received                     | P      | PO workflow exists; confirm against git functions before claiming GRN stock.          |
| 74  | Supplier invoices / payment status | P      |                                                                                       |
| 75  | Expenses + documents               | P      | Expenses exist. File uploads are limited (URL/text, no storage bucket in migrations). |
| 76  | Recurring expenses                 | P      | Recurring invoices exist; expense reminders incomplete.                               |
| 77  | Cost history / compare             | P      | `cost_price` on products.                                                             |
| 78  | Reorder suggestions                | M      |                                                                                       |
| 79  | Supplier returns                   | M      |                                                                                       |
| 80  | Cost vs sales vs stock value       | P      | Reports exist; assumptions must stay labelled.                                        |

### I. Security, privacy, compliance 81–90

| #   | Feature                                  | Status | Notes                                                                             |
| --- | ---------------------------------------- | ------ | --------------------------------------------------------------------------------- |
| 81  | Auth, recovery, sessions, MFA            | P      | Solid session model. Platform admin MFA. User MFA not required for all merchants. |
| 82  | Tenant isolation + roles                 | IV     | RLS + isolation tests (token required).                                           |
| 83  | Validation, rate limits, uploads, errors | P      | Rate limits on public store RPCs and auth. Uploads not a full file platform.      |
| 84  | Secrets, deps, config                    | P      | `.env.example` placeholders. Audit findings recorded.                             |
| 85  | Privacy notices and rights               | P      | Draft legal pages. Not reviewed.                                                  |
| 86  | Terms / merchant / marketplace / refunds | P      | Drafts.                                                                           |
| 87  | Tax / invoice / receipt local rules      | P      | Configurable amounts. No ZIMRA claim.                                             |
| 88  | Audit of money and permissions           | INV    |                                                                                   |
| 89  | Backup / restore / IR                    | P      | Docs + nightly dump job. Restore unverified.                                      |
| 90  | Security tests, a11y, go-live list       | P      | Docs and unit tests. Go-live checklist red.                                       |

### J. Reliability, reporting, admin 91–100

| #   | Feature                              | Status | Notes                                                             |
| --- | ------------------------------------ | ------ | ----------------------------------------------------------------- |
| 91  | Operational dashboard                | INV    | Real sales/stock figures, not random charts.                      |
| 92  | Sales reports                        | INV    | Period / product / method as implemented.                         |
| 93  | Inventory valuation                  | P      | Depends on cost_price quality.                                    |
| 94  | Fulfilment reports / overdue         | P      | Storefront open/unpaid counts. No overdue engine.                 |
| 95  | Searchable activity logs             | P      |                                                                   |
| 96  | Email/messaging notifications        | P      | In-app plus optional Resend outbox. WhatsApp is still links only. |
| 97  | Retry-safe jobs / webhooks           | P      | Subscription Paynow poll. No general job table.                   |
| 98  | Cache separation                     | P      | Documented; Redis optional for workspace.                         |
| 99  | Monitoring                           | P      | Sentry optional.                                                  |
| 100 | Migrations, tests, staging, rollback | P      | Git migrations + CI. Staging drift remains.                       |

## 4. Retention 100

Almost all of Part 2 is **M** (loyalty, coupons, gift cards, wishlists, custom domains, shift handovers, sponsored listings, usage billing dashboards). Exceptions:

| #     | Feature                           | Status                                  |
| ----- | --------------------------------- | --------------------------------------- |
| 16    | Shareable product/shop links      | INV                                     |
| 21    | Order status notifications        | P in-app; email if Resend is configured |
| 31    | Low-stock alerts                  | P                                       |
| 33    | Automatic confirmation            | P this slice                            |
| 35    | Automatic delivery fee            | P flat fee                              |
| 36    | Receipt after relevant event      | P POS / recorded payment                |
| 61    | Custom domain                     | X / M                                   |
| 73/74 | Collection and delivery estimates | P merchant text                         |
| 79    | Total breakdown                   | INV checkout                            |
| 91    | Identity verification             | M do not badge                          |
| 100   | Plan limits / billing history     | P Pro Paynow subscriptions              |

Do not implement gift cards, store credit, or loyalty points until ledger and fraud controls exist.

## 5. Duplicates, drift, dead ends

- WhatsApp is links, not the Cloud API.
- Platform Paynow vs customer checkout are separate on purpose.
- Locations are in git; POS still uses the default location. Transfers are not built.
- README is still an old product prompt. `ENVIRONMENT_SETUP.md` is the operator guide.
- Ten templates are real layouts, not ten colour skins.

## 6. Baseline checks

Recorded when this slice was finished (see the PR body for the actual command output): `npx tsc --noEmit`, `npx vitest run tests/storefront.test.ts`. Integration tests need `SUPABASE_ACCESS_TOKEN` and were not assumed green without that token.

## 7. Decision after audit

No critical existing hole required a full stop. The highest-value complete slice that matches the prompt, without pretending 200 features exist, is the **server-side order rules engine** (cash, quote delivery, automatic acceptance, terms snapshot).
