# Feature priority matrix

**Date:** 2 November 2026  
**Scoring:** 1 (low) – 5 (high). **Value** = everyday Zimbabwe owner pain. **Revenue** = more GMV, retention, or willingness to pay Pro. **Complexity** = schema + UI + test. **Risk** = money integrity, RLS, legal, or fake integration. **Now** = fit for the next approved stage.

Priority list from the brief (1–15) is scored against **current code**, not a blank sheet.

| Pri | Item                        | Status now       | Value | Revenue | Complexity | Risk | Now?             | Why                                                                              |
| --- | --------------------------- | ---------------- | ----- | ------- | ---------- | ---- | ---------------- | -------------------------------------------------------------------------------- |
| 1   | Offline POS                 | Partial          | 5     | 4       | 4          | 4    | **Stage 4 done** | Queue, closed-drawer retry, cart snapshot, estimate labels. Still not a rewrite. |
| 2   | Multi-currency records      | Partial          | 5     | 4       | 4          | 5    | **Stage 2**      | Needs a money ledger. Do not overload `platform_fx`.                             |
| 3   | WhatsApp product sharing    | Partial          | 5     | 5       | 2          | 1    | **Stage 1**      | `wa.me` + product fields. No Cloud API.                                          |
| 4   | Digital credit book         | Partial          | 5     | 4       | 3          | 3    | **Stage 1**      | Balance exists; notebook UI and repayments do not.                               |
| 5   | Split payments              | Missing          | 5     | 4       | 4          | 4    | **Stage 2**      | Touches `create_sale`; do after named methods.                                   |
| 6   | WhatsApp receipts           | Partial          | 4     | 3       | 2          | 1    | **Stage 5 done** | POS still `wa.me`. Shop orders can enqueue WhatsApp after opt-in.                |
| 7   | Low-stock alerts            | Partial          | 5     | 4       | 2          | 2    | **Stage 1**      | `min_stock` + insights exist; put on home.                                       |
| 8   | Daily cash-up               | Exists           | 5     | 3       | 2          | 3    | **Stage 1**      | Extend till close with method totals.                                            |
| 9   | Delivery zones and fees     | Partial          | 4     | 4       | 2          | 2    | **Stage 3**      | Engine exists; add town presets.                                                 |
| 10  | Deposits and lay-by         | Missing          | 4     | 4       | 4          | 4    | **Stage 3**      | New money workflow; after credit book.                                           |
| 11  | Wholesale / retail price    | Partial          | 4     | 4       | 3          | 3    | **Stage 3**      | Second price on `products` is enough at first.                                   |
| 12  | Poster generator            | Missing          | 3     | 3       | 3          | 2    | Later            | Marketing Studio copy already exists.                                            |
| 13  | Verified stores and reviews | Partial / Exists | 4     | 4       | 2          | 2    | **Stage 3**      | Reviews exist; public badge does not.                                            |
| 14  | Branch and staff            | Exists / Partial | 3     | 3       | 3          | 3    | Later            | Staff/RBAC/branches exist; transfers do not. Do not rebuild.                     |
| 15  | AI assistant                | Exists           | 3     | 3       | 2          | 3    | Later            | Already ships; needs keys. Do not expand until till numbers are trusted.         |

## Area scores (all 100, rolled up)

| Area               | Exists | Partial | Missing | First move                                        |
| ------------------ | ------ | ------- | ------- | ------------------------------------------------- |
| 1 Payments         | 1      | 6       | 3       | Named rails + cash-up columns + credit repayments |
| 2 WhatsApp         | 2      | 6       | 2       | Outbox + opt-in; Cloud send only when configured  |
| 3 Retail ops       | 0      | 6       | 4       | Credit book; not variants                         |
| 4 Delivery         | 3      | 7       | 0       | Presets; not courier APIs                         |
| 5 Trust            | 6      | 4       | 0       | Marketplace verified badge                        |
| 6 Money-making     | 4      | 5       | 1       | Home: low stock + debts + yesterday               |
| 7 Marketing        | 2      | 2       | 6       | Leave coupons/loyalty                             |
| 8 Zimbabwe support | 2      | 7       | 1       | Offline POS hardening                             |
| 9 Established      | 7      | 1       | 2       | Do not rebuild staff                              |
| 10 Standout        | 5      | 1       | 4       | Do not start diaspora/academy                     |

## What not to do next

- Do not implement all 100.
- Do not enable WhatsApp Cloud send without Meta eligibility, approved templates, a DPA, and a live test. Do not stub Meta Groups. Do not add EcoCash APIs or ZIPIT adapters without a provider contract and a test against a real transaction.
- Do not add product variants or bundles in the same stage as money changes.
- Do not use `platform_fx` to convert shop orders.
- Do not create a second POS or a second customers table.

## Recommended Stage 1 (awaits approval)

**Name:** Morning desk, till, notebook, WhatsApp share.

**Owner questions it must answer:**

- How much came in today/yesterday, by method?
- Who owes me?
- What is about to run out?
- What can I send on WhatsApp in one tap?

**In scope (reuse only):**

1. Dashboard + cash-up: totals grouped by `payments.method` (and business currency). Still one currency per business until Stage 2.
2. POS method labels: EcoCash / InnBucks / ZIPIT / Bank as display rails mapped onto existing enum or a thin `rail` text column, **no fake confirmation**.
3. Customer credit book: list, running balance, record repayment (new RPC writing `payments` + decreasing `outstanding_balance`).
4. WhatsApp product share + sale/order receipt prefill using `buildWhatsAppLink`.
5. Home low-stock list (already computed) above the fold.
6. Offline POS: keep queue; show why a sync failed (closed drawer); do not invent a new sync engine.

**Out of scope for Stage 1:** split tenders, lay-by, FX ledger, Cloud WhatsApp, posters, Shona UI, stock transfers, AI expansion.

See `KWETUU_IMPLEMENTATION_ROADMAP.md` for Stage 2+.
