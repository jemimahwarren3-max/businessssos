# Kwetuu: 100-feature audit

**Date:** 2 November 2026 (Africa/Harare)  
**Head:** `3af0077` (master after #108)  
**Method:** repository inspection of migrations, RPCs, routes, and existing audits. Not a live EcoCash/Paynow/WhatsApp test, legal opinion, or restore drill.

This is the first required deliverable. **No features were implemented in this pass.** The recommendation is a single Stage 1 slice; it waits for approval.

## Product principle (from the brief)

Kwetuu should make running a business easier, cheaper, safer and more profitable when the internet is unreliable, electricity drops, customers pay in mixed methods, and records live in WhatsApp and notebooks. It should not become another dashboard that is hard to use.

## Coverage (100 items)

| Status      | Count | Meaning                                                                    |
| ----------- | ----- | -------------------------------------------------------------------------- |
| **Exists**  | 32    | Shipped in schema + merchant/shopper UI, with the qualification in the row |
| **Partial** | 45    | Foundation exists; the Zimbabwe-shaped behaviour is incomplete or generic  |
| **Missing** | 23    | No table, RPC, or real workflow                                            |

Do not treat “Exists” as “loved in a tuckshop”. Several Exists items are English-only, online-only, or generic (for example `mobile_money` instead of EcoCash).

## How to read a row

- **Reuse** is the existing table/RPC/UI to extend. Do not create a parallel system.
- **Hardcoded ZW** means Zimbabwe-specific values are in code rather than country settings.
- Integrations are only “working” when configured and tested. WhatsApp Cloud, EcoCash APIs, InnBucks APIs, and ZIPIT are **not** connected.

---

## 1. Payments and money (1–10)

| #   | Idea                     | Status  | What exists                                                                                                                                                        | Gap                                                                                | Reuse                                                                   |
| --- | ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Multiple methods         | Partial | POS: `cash`, `card`, `mobile_money`, `bank_transfer`, `credit`. Shop: pickup/delivery cash, Paynow (gated), manual EcoCash/InnBucks/bank/`other`.                  | No ZIPIT. POS does not name EcoCash/InnBucks.                                      | `payment_method` enum, `payments`, storefront `manualMethods`           |
| 2   | Split payments           | Missing | One method per `create_sale` / `store_orders.payment_method`. Invoice can take several payments over time.                                                         | Cannot tender one sale as cash + EcoCash.                                          | New `sale_tenders` (or multiple `payments` rows) + `create_sale` change |
| 3   | USD and ZiG              | Partial | Business currency includes USD and `ZWG` (shown as ZiG). Platform `platform_fx.usd_to_zwg` is **display only** for Kwetuu billing. Shop Paynow is USD-only in SQL. | No per-sale FX ledger. Shopper money is not converted with platform FX.            | `businesses.currency`, `platform_fx`, `format.ts`                       |
| 4   | ZAR                      | Partial | `ZAR` is a business currency.                                                                                                                                      | No ZAR rails or conversion records.                                                | Same currency field                                                     |
| 5   | Do not trust screenshots | Partial | Manual proof stays `pending`. Seller confirm is audited. Shop Paynow confirms only after server poll.                                                              | EcoCash/InnBucks/ZIPIT have no provider verify.                                    | `payment-proofs` bucket, `store_order_payment_confirmations`            |
| 6   | Reference matching       | Partial | Optional proof reference, seller `confirmation_reference`, Paynow poll reference.                                                                                  | No bank/EcoCash statement import or auto-match.                                    | `payments.reference`                                                    |
| 7   | Deposits                 | Missing | —                                                                                                                                                                  | Need deposit/balance on orders or a dedicated table.                               | Could hang off `customers` + `payments`                                 |
| 8   | Lay-by                   | Missing | —                                                                                                                                                                  | Instalments, due dates, collection eligibility.                                    | New domain; do not fake with invoices                                   |
| 9   | Debtor / credit          | Partial | `customers.outstanding_balance`; POS `credit` sale; invoice pay-down.                                                                                              | No credit-sale repayment RPC, limits, or notebook-style ledger UI.                 | `customers`, `payments`, `create_sale`                                  |
| 10  | Daily cash-up            | Exists  | `cash_sessions` / `cash_movements`, open/close, expected vs counted.                                                                                               | Counts **cash till**, not EcoCash/bank/ZiG columns. One open session per business. | `cash-drawer.tsx`, `get_cash_drawer`                                    |

**Cashier glance (“USD cash, ZiG, EcoCash today”):** not built. Dashboard shows `todaySales` / `todayProfit` in the business currency only (`loadDashboard` in `src/lib/business.server.ts`).

---

## 2. WhatsApp and social commerce (11–20)

WhatsApp today is still **`wa.me` for merchant-tapped share and POS receipts**. Shop order updates and opted-in news can sit on `notification_outbox` as `channel = 'whatsapp'`. Graph send stays off until Cloud credentials and Meta templates exist; rows are never marked sent without a provider message id.

| #   | Idea                     | Status  | What exists                                                                     | Gap                                                                   |
| --- | ------------------------ | ------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 11  | Product sharing          | Partial | Copy product URL. `buildWhatsAppLink` exists for quotes/POs/store chrome.       | No one-tap product card (photo, price, stock, link) on the catalogue. |
| 12  | Catalogue generation     | Partial | Web catalogue + 60 templates.                                                   | No WhatsApp/Meta catalogue sync.                                      |
| 13  | Order without account    | Exists  | Guest checkout, order access code, public `/store/{slug}/order/{reference}`.    | Not a WhatsApp-native order.                                          |
| 14  | Shareable carts          | Missing | Cart is `localStorage` per shop.                                                | No share URL / token.                                                 |
| 15  | WhatsApp order updates   | Partial | Outbox `channel = 'whatsapp'` after checkout opt-in.                            | Stays pending until WhatsApp Cloud credentials + Meta templates.      |
| 16  | Meta Groups conversation | Missing | —                                                                               | Eligibility + Cloud API. Do not stub.                                 |
| 17  | WhatsApp receipts        | Partial | Print + email + `wa.me` prefill; shop order placed/status can enqueue WhatsApp. | POS receipts are still `wa.me`. Cloud send only when configured.      |
| 18  | Social order capture     | Partial | Outbound quote/PO WhatsApp.                                                     | No inbound Facebook/Instagram/WhatsApp order ingest.                  |
| 19  | Click-to-chat            | Exists  | Store chrome uses `store.whatsapp \|\| store.phone`.                            | Relies on merchant entering a number.                                 |
| 20  | Marketing consent        | Partial | `shopper_shop_consents.marketing` + Grow queue to opted-in numbers.             | Cloud does not send until configured; no fake sent.                   |

---

## 3. Everyday retail operations (21–30)

| #   | Idea                      | Status  | What exists                                                                                    | Gap                                         |
| --- | ------------------------- | ------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 21  | Customer credit book      | Partial | Balance column + credit sales.                                                                 | Notebook UX: who, how much, last paid, due. |
| 22  | Supplier debt book        | Partial | `suppliers.outstanding_amount` column.                                                         | Not updated by POs/UI.                      |
| 23  | Wholesale vs retail price | Partial | One `selling_price`. Wholesale is a business type / template layout.                           | No second price list.                       |
| 24  | Bulk quantity pricing     | Missing | `minQty`/`maxQty` are limits, not breaks.                                                      | New price-break table.                      |
| 25  | Negotiable discounts      | Partial | Header discount on sale/invoice/quote. POS ignores staff unit prices (`KNOWN_LIMITATIONS.md`). | Controlled per-line discount + permission.  |
| 26  | Bundles                   | Missing | Documented gap.                                                                                | New product-group model.                    |
| 27  | Variants                  | Missing | One SKU, one price, one stock.                                                                 | Large inventory change; do not rush.        |
| 28  | Pre-orders                | Missing | —                                                                                              | Needs expected date + stock flag.           |
| 29  | Stock reservations        | Partial | Online orders reserve stock. POS/offline does not.                                             | POS hold-for-customer.                      |
| 30  | Multiple UoM              | Partial | Free-text `products.unit`.                                                                     | No piece↔box conversion.                    |

---

## 4. Delivery and collection (31–40)

| #   | Idea                    | Status  | What exists                                              | Gap                                           |
| --- | ----------------------- | ------- | -------------------------------------------------------- | --------------------------------------------- |
| 31  | Harare zones            | Partial | Seller-defined zones + fees. Default TZ `Africa/Harare`. | No suburb preset list.                        |
| 32  | Other towns             | Partial | Same zone JSON (any name).                               | No Bulawayo/Mutare packs.                     |
| 33  | Collection points       | Exists  | Structured points, checkout selection, SQL clocks.       | —                                             |
| 34  | Seller-managed delivery | Exists  | Pickup / delivery / quote fulfilment.                    | —                                             |
| 35  | Independent courier     | Partial | Manual courier name, reference, tracking URL.            | No courier API.                               |
| 36  | Fee calculator          | Exists  | Flat / zone / free / quote; server recomputes.           | No distance/geocode (`KNOWN_LIMITATIONS.md`). |
| 37  | Tracking                | Partial | Order events + optional tracking URL.                    | No live GPS.                                  |
| 38  | Proof of delivery       | Partial | Payment proof only.                                      | No delivery photo/signature/PIN.              |
| 39  | Failed delivery         | Partial | Cancel + reason.                                         | No attempt/reschedule workflow.               |
| 40  | Regional rules          | Partial | Hours, cut-off, collection windows in SQL.               | No “we do not deliver to X” country engine.   |

---

## 5. Trust and customer experience (41–50)

| #   | Idea                  | Status  | What exists                                  | Gap                                               |
| --- | --------------------- | ------- | -------------------------------------------- | ------------------------------------------------- |
| 41  | Verified stores       | Partial | Launch eligibility / suspend.                | No public verified badge on `/market`.            |
| 42  | Ratings and reviews   | Exists  | `store_reviews`, public + admin.             | —                                                 |
| 43  | Verified purchase     | Exists  | Review requires order reference + token.     | —                                                 |
| 44  | Availability          | Exists  | `available`, `stockLabel`, `maxPurchasable`. | No “available on order” pre-order state.          |
| 45  | Return policies       | Exists  | `returnsPolicy` on storefront + checkout.    | —                                                 |
| 46  | Order references      | Exists  | Unique reference on every store order.       | POS uses `sale_number`.                           |
| 47  | Support / disputes    | Exists  | Complaints + listing reports.                | Not a full case-management centre.                |
| 48  | Seller response speed | Partial | Sellers can reply to reviews/complaints.     | No “usually replies in X hours” from data.        |
| 49  | Suspicious activity   | Partial | Rate limits, reports, lockout RPCs.          | No fraud product.                                 |
| 50  | Identity controls     | Partial | Auth, staff invites, audit.                  | No KYC / public verification without oversharing. |

---

## 6. Make more money (51–60)

| #   | Idea                  | Status  | What exists                                     | Gap                                                                  |
| --- | --------------------- | ------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| 51  | Daily profit          | Exists  | `todayProfit` = sales − COGS path on dashboard. | Does not subtract today’s expenses.                                  |
| 52  | Best sellers          | Exists  | Reports `topProducts` by revenue.               | —                                                                    |
| 53  | Slow movers           | Exists  | Reports `slowProducts`.                         | —                                                                    |
| 54  | Low-stock prediction  | Partial | Insights 30-day velocity → days to stockout.    | Not on the home “what do I do today” list.                           |
| 55  | Reorder suggestions   | Partial | `min_stock` + forecast; POs are manual.         | No suggested qty / lead time.                                        |
| 56  | Product profitability | Partial | Margin is aggregate. Top list is revenue.       | Per-SKU profit.                                                      |
| 57  | Expenses              | Exists  | Full expense CRUD + import.                     | —                                                                    |
| 58  | Cash-flow calendar    | Missing | —                                               | Supplier dues + credit + expenses on a calendar.                     |
| 59  | Sales comparison      | Partial | Period % change + charts.                       | Weak “vs yesterday” one-tap.                                         |
| 60  | Health score          | Exists  | Deterministic 0–100 on dashboard.               | Does not include fulfilment backlog or debts as first-class signals. |

Dashboard can already answer, roughly: yesterday’s sales/profit, who has outstanding invoices, which SKUs are low. It cannot yet answer mixed-currency takings, EcoCash vs cash, supplier bills due, or undelivered orders in one glance.

---

## 7. Marketing and retention (61–70)

| #   | Idea                 | Status  | What exists                                    | Gap                           |
| --- | -------------------- | ------- | ---------------------------------------------- | ----------------------------- |
| 61  | Discount campaigns   | Partial | POS/invoice/quote discounts.                   | No storefront campaign price. |
| 62  | Coupons              | Missing | Roadmap deferred.                              | —                             |
| 63  | Loyalty              | Missing | —                                              | —                             |
| 64  | Birthday offers      | Missing | —                                              | Needs consent + DOB.          |
| 65  | Referrals            | Partial | Analytics `source` enum only.                  | No reward ledger.             |
| 66  | Abandoned cart       | Missing | Cart is local.                                 | Needs identifiable cart.      |
| 67  | Customer groups      | Missing | Flat customer list.                            | —                             |
| 68  | Marketing copy AI    | Exists  | Growth Studio drafts; not auto-published.      | Needs Gemini/Groq configured. |
| 69  | Poster generator     | Missing | Static `/marketing` placeholders only.         | —                             |
| 70  | Campaign performance | Exists  | Visitors / orders / paid revenue per campaign. | —                             |

---

## 8. Zimbabwe-specific support (71–80)

| #   | Idea                     | Status  | What exists                                                                        | Gap                                                                         |
| --- | ------------------------ | ------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 71  | Low-data mode            | Partial | Account toggle + `DeferredImage` on product photos.                                | First public-shop HTML may still include image URLs. Logos/auth still load. |
| 72  | Offline POS              | Partial | IndexedDB + queued cash/card-as-cash sales. Stock labelled estimate while offline. | Many flows still online-only.                                               |
| 73  | Auto sync                | Exists  | Sync on reconnect, idempotent keys, cashier Retry this sale on failed rows.        | No background sync when the tab is closed.                                  |
| 74  | Power interruption       | Partial | Queued sale + idempotency + in-progress cart snapshot (`posDrafts`).               | Not proven on a real till power cut.                                        |
| 75  | Receipts                 | Exists  | Browser print POS + shop receipts; email when Resend is configured.                | No thermal-printer driver.                                                  |
| 76  | Local business templates | Partial | 60 website templates (grocery, bakery, salon, hardware, …).                        | Not a POS “tuckshop setup” pack.                                            |
| 77  | Shona and Ndebele        | Missing | English UI.                                                                        | i18n framework.                                                             |
| 78  | Local formats            | Partial | +263 heuristic in `whatsapp.ts`; `Africa/Harare` defaults.                         | Hardcoded, not country pack.                                                |
| 79  | Tax exports              | Partial | Full data export includes sales/tax fields.                                        | Not a fiscalisation or ZIMRA pack. Do not claim it is.                      |
| 80  | Business education       | Partial | In-app Help.                                                                       | No academy.                                                                 |

---

## 9. Growth / established businesses (81–90)

| #   | Idea              | Status  | What exists                                                                       | Gap                                      |
| --- | ----------------- | ------- | --------------------------------------------------------------------------------- | ---------------------------------------- |
| 81  | Multiple branches | Exists  | `locations` + Branches UI.                                                        | —                                        |
| 82  | Branch inventory  | Partial | `product_stock` per location. App still sells default location.                   | POS `adjust_stock` often omits location. |
| 83  | Stock transfers   | Missing | Migration comment: not implemented.                                               | —                                        |
| 84  | Staff accounts    | Exists  | Invites, staff login, shop password.                                              | —                                        |
| 85  | Role permissions  | Exists  | Granular `has_permission` + team matrix.                                          | —                                        |
| 86  | Activity logs     | Exists  | `audit_logs` + settings UI.                                                       | —                                        |
| 87  | Shifts / cash     | Exists  | Cash drawer + time clock.                                                         | Not named “shift” end-to-end.            |
| 88  | Suppliers         | Exists  | CRUD + WhatsApp PO share.                                                         | Outstanding balance unused.              |
| 89  | Purchase orders   | Exists  | Create, status, receive.                                                          | —                                        |
| 90  | Multi-business    | Missing | `createBusinessRecord` returns the existing shop. Workspace loads one membership. | Switcher + data separation.              |

---

## 10. Standout (91–100)

| #   | Idea                  | Status  | What exists                                           | Gap                                                                      |
| --- | --------------------- | ------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| 91  | AI assistant          | Exists  | `/assistant` + dashboard briefing on real aggregates. | Needs API keys; not voice.                                               |
| 92  | Voice commands        | Missing | —                                                     | —                                                                        |
| 93  | AI stock insights     | Partial | Insights forecast + AI mentions low stock.            | Not action-to-PO.                                                        |
| 94  | Launch assistant      | Exists  | Onboarding + launch centre + optional AI shop draft.  | Still easy to 404 a draft preview (fixed #108, needs live confirmation). |
| 95  | Storefront designer   | Exists  | Tabbed builder, 60 templates, colours, content.       | —                                                                        |
| 96  | Diaspora shopping     | Missing | —                                                     | Payments/legal separately.                                               |
| 97  | Discovery marketplace | Exists  | `/market`, `/stores`, `browse_marketplace`.           | Empty until shops publish.                                               |
| 98  | B2B marketplace       | Missing | Merchant suppliers only; wholesale layout is visual.  | —                                                                        |
| 99  | Peer benchmarks       | Missing | —                                                     | Needs enough clean data; privacy.                                        |
| 100 | Academy / community   | Missing | Help articles only.                                   | —                                                                        |

---

## Dependencies (do not invert)

```
Named POS methods  →  split tenders  →  cashier “today by rail”
Credit balance     →  credit ledger UI  →  lay-by / deposits
Locations          →  default-location POS  →  transfers
Offline queue      →  drawer-open rules  →  in-progress sale snapshot
wa.me share        →  WhatsApp Cloud outbox (queued; send when configured)  →  Meta Groups
Manual pay safety  →  EcoCash adapter (provider + legal)
Reviews / complaints (done)  →  verified badge  →  response-time SLA
Storefront publish →  marketplace discovery
```

## Security, RLS, integrity (implications)

- New money tables must follow the cash-drawer pattern: **member SELECT, writes only in security-definer RPCs**, `assertPermission`, billing gates where `create_sale` is already wrapped.
- Do not mark shop orders paid from a client upload. Keep proof ≠ paid (`20261021140000`, `20261023120000`).
- Offline sales remain unconfirmed until `create_sale` succeeds.
- WhatsApp Cloud is a new data processor (phone numbers, message bodies) once send is enabled. Outbox plumbing is in this stage; `THIRD_PARTY_SERVICES.md` and legal describe the optional Graph path. Do not treat queued rows as delivered.
- Split payments and lay-by must be idempotent (`payments.idempotency_key` already exists).
- Multi-currency ledgers must store **original amount + currency + optional USD equivalent + rate + rate source + timestamp**. Do not rewrite history when the operator changes `platform_fx`.

## Zimbabwe vs Southern Africa

See `KWETUU_ZIMBABWE_MARKET_REQUIREMENTS.md`. Short version: launch complete in Zimbabwe; keep payment rails, phone, tax, and language as **country packs**, because EcoCash/InnBucks/`+263`/`Africa/Harare` are already leaking into application code.

## Existing audits this document does not replace

`docs/KNOWN_LIMITATIONS.md`, `docs/KWETUU_PAYMENTS_AUDIT_AND_READINESS.md`, `docs/OFFLINE_AND_SYNC_DESIGN.md`, `docs/STOREFRONT.md`, `docs/BUSINESSOS_AUDIT.md`. Those remain the operational caveats. This file only maps the 100-idea list onto current code.
