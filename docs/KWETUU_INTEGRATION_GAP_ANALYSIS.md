# Integration gap analysis

**Date:** 2 November 2026  
**Rule:** do not claim an integration works unless it is configured and has been tested against a real transaction.

## Connected (code exists; live status depends on secrets)

| System                   | Used for                             | Config                                                             | Honest status                                                                                                  |
| ------------------------ | ------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Supabase Auth + Postgres | Entire backend                       | Staging vs production projects                                     | Staging is what Cloud Run uses until both production URL **and** publishable key are set                       |
| Paynow                   | **Platform** Pro billing             | `PAYNOW_*` including optional ZiG keys                             | Shop Paynow is a separate, globally gated path                                                                 |
| Paynow (shop)            | Customer checkout                    | Per-shop encrypted credentials + `store_payment_provider_controls` | Default **off**. USD-only trigger. Needs provider/platform approval (`KWETUU_PAYMENTS_AUDIT_AND_READINESS.md`) |
| Resend                   | Merchant alerts + shopper mail       | `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, flush job                   | Unconfigured mail stays in `notification_outbox`                                                               |
| Gemini / Groq            | Assistant, growth drafts, shop draft | `GEMINI_API_KEY` / Groq                                            | Optional; sends aggregates, not card data                                                                      |
| Supabase Storage         | `product-media`, `payment-proofs`    | Bucket migrations                                                  | Proofs are not world-readable                                                                                  |
| Upstash Redis            | Optional workspace cache             | Optional                                                           | App works without it                                                                                           |
| Sentry                   | Error capture helper                 | DSN if set                                                         | Not a substitute for money reconciliation                                                                      |

## Deliberately not connected

| System                      | Why it is not in Stage 1                            | What a real connection would require                                                  |
| --------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| WhatsApp Cloud / Meta Graph | Outbox + opt-in exist; flush no-ops without secrets | Meta verification, approved templates (`kwetuu_order_*`), DPA, Groups API still later |
| EcoCash merchant API        | Manual kind + screenshot only                       | Contract, IPN, reference match, refunds                                               |
| InnBucks API                | Same                                                | Same                                                                                  |
| ZIPIT                       | Not in schema                                       | Bank/mobile partner                                                                   |
| Card acquiring (non-Paynow) | POS `card` is a label                               | PCI — do not collect PAN                                                              |
| Courier networks            | Manual name + URL                                   | Per-courier adapter                                                                   |
| RBZ / automatic FX feed     | Operator types `platform_fx`                        | Licensed feed; still must not rewrite old sales                                       |
| Fiscalisation / ZIMRA       | Export only                                         | Certified device path; out of scope                                                   |
| Thermal printers            | `window.print`                                      | Device-specific; later                                                                |
| Voice STT                   | —                                                   | New vendor                                                                            |

`docs/THIRD_PARTY_SERVICES.md` is slightly stale (it still says there is no upload flow). Storage buckets exist. Treat this file as the current map.

## Safe “integrations” that are just links

These are **not** APIs. They are allowed in Stage 1 because the merchant hits Send:

| Link                      | Code                              | Use                                                    |
| ------------------------- | --------------------------------- | ------------------------------------------------------ |
| `https://wa.me/{n}?text=` | `src/lib/whatsapp.ts`             | Product share, receipt, quote, PO, store click-to-chat |
| Order URL                 | `/store/{slug}/order/{reference}` | Guest tracking                                         |
| Product URL               | store product route               | Share                                                  |

A prefilled WhatsApp receipt is a **Stage 1 feature**. A sent WhatsApp receipt is an **integration project**.

## Payment confirmation matrix (do not flatten)

| Path                              | Marks paid when                                          | Trust                                        |
| --------------------------------- | -------------------------------------------------------- | -------------------------------------------- |
| POS cash/card/mobile/bank         | `create_sale` succeeds                                   | Merchant-entered. Offline = draft until sync |
| POS credit                        | Sale on account                                          | Increases `outstanding_balance`              |
| Shop cash on collection           | Order placed; paid in person later                       | Seller confirm RPC                           |
| Shop manual EcoCash/InnBucks/bank | Buyer uploads proof → **pending**; seller confirm → paid | Screenshot is not paid                       |
| Shop Paynow                       | Server poll/hash + amount match                          | Only if globally enabled and keys valid      |

Stage 1 must not add a button that sets EcoCash to paid because a JPEG was attached.

## Email vs WhatsApp notifications

| Event                 | Today        | Stage 1                                           | Later                      |
| --------------------- | ------------ | ------------------------------------------------- | -------------------------- |
| Order placed / status | Email outbox | WhatsApp outbox if opted in (pending until Cloud) | Meta-approved templates    |
| POS receipt           | Print        | wa.me prefill                                     | Cloud                      |
| Marketing             | Not sent     | Opt-in list + queue; stays pending                | Cloud send when configured |

## Country / provider adapter

When a real EcoCash or ZA rail is added, isolate it behind a provider interface (create intent, poll, verify, refund). Do not put HTTP calls inside `create_sale`. Shop Paynow is already closer to this pattern (`src/lib/payments/shop-paynow.server.ts`) than POS is.

## Secrets and environments

- Staging SQL is applied from CI via `scripts/staging-manifest.mjs`. New RPCs for credit repayment / daily takings **must** be on that manifest with an idempotent `skipIf`.
- Production Supabase cutover still needs `PRODUCTION_SUPABASE_URL` and `PRODUCTION_SUPABASE_PUBLISHABLE_KEY` together.
- Do not put provider secrets in the browser.
