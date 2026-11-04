# Zimbabwe market requirements (and Southern Africa expansion)

**Date:** 2 November 2026  
**Companion:** `KWETUU_100_FEATURE_AUDIT.md`

Kwetuu’s first complete market is Zimbabwe. Southern Africa is a **configuration problem**, not a second app. Today several Zimbabwe facts are hardcoded. That is acceptable for launch if we stop spreading them, and if we do not pretend EcoCash or WhatsApp Cloud work until they are contracted and tested.

## Realities that should shape the product

1. **Selling already happens on WhatsApp and Facebook.** A storefront that cannot be shared into a chat will lose to a photo album. First mile: `wa.me` with price and link. Cloud API is later.
2. **Money is mixed.** Cash, EcoCash, InnBucks, ZIPIT, bank, and sometimes card. One tender per sale fights how people pay.
3. **USD and ZiG both matter.** Keep them separate. Do not silently convert shopper money with the operator’s billing FX table (`platform_fx` is display-only for Kwetuu Pro).
4. **Cash still closes the day.** A cashier must see expected vs counted cash, and what came in on mobile money, without opening five screens.
5. **Internet and power fail.** Offline POS is income protection, not a nice-to-have. Public shops and Paynow cannot be offline.
6. **Trust is the online-shopping bottleneck.** Verified-purchase reviews and “screenshot ≠ paid” already exist; they should stay visible.
7. **Notebooks are the competitor.** Credit book, supplier book, lay-by, deposits. If Kwetuu cannot replace the book, owners will keep the book and ignore Kwetuu.
8. **English-only UI is a ceiling.** Shona and Ndebele are not required to ship Stage 1, but core POS labels should be translatable.

## Zimbabwe launch pack (target)

| Capability | Zimbabwe launch | Must not hardcode forever |
| ---------- | --------------- | ------------------------- |
| Currency | USD + ZiG (`ZWG`) as first-class; ZAR as a business currency | Currency list already includes regional codes — keep it data, not UI copy |
| Phone | `+263`, local `07…` → 263 in `src/lib/whatsapp.ts` | Country dial code in a pack |
| Payments (shop) | Cash on collection, EcoCash/InnBucks/bank **instructions + proof**, Paynow when approved | Kind list per country |
| Payments (POS) | Cash, mobile money (named), bank, card, credit | Enum today is generic; add a `rail` or display map, not a new app |
| FX | Operator-entered USD↔ZiG for **platform billing display only** | Never use that rate to rewrite shop orders |
| Delivery | Seller zones; later Harare/Bulawayo/Mutare presets | Town packs |
| Languages | English first | i18n keys from the start of any new POS copy |
| Tax | Export sales/purchases/expenses | Not fiscalisation; do not claim ZIMRA compliance |
| Timezone | `Africa/Harare` default | `businesses.timezone` already exists (international expansion migration); onboarding should set it |

## What is already hardcoded (debt)

| Location | Value | Risk |
| -------- | ----- | ---- |
| `src/lib/whatsapp.ts` | Leading 0 → 263 | Breaks a regional merchant with a local 0 prefix in another country |
| `src/lib/storefront/onboarding-defaults.ts` | `Africa/Harare` | Fine as default if overridable |
| `src/lib/storefront/manual-payments.ts` | `ecocash`, `innbucks` | Correct for ZW launch; make it a country pack |
| `src/lib/payments/paynow-poll.ts` | `paynow.co.zw` | Zimbabwe-only provider — belongs in a provider adapter |
| Shop Paynow SQL | USD-only orders | Blocks ZiG shop checkout even if a provider later supports it |
| Marketing (`src/routes/index.tsx`) | EcoCash / InnBucks copy | OK for ZW homepage |

`businesses.currency`, `timezone`, and `tax_mode` were added in `supabase/migrations/20260808160000_international_expansion.sql`. Later `create_business_with_owner` variants do not always pass timezone. Treat country settings as a real table before adding Zambia/Botswana rails.

## Country pack shape (do not build in Stage 1 unless touching phones/payments)

Suggested columns (logical; not a migration yet):

- `country_code` (ZW, ZA, BW, ZM, …)
- `dial_code`, `phone_trunk_prefix`
- `currencies[]`, `default_currency`, `default_timezone`
- `payment_rails[]` (id, label, `provider`: `none` \| `paynow` \| `future`)
- `manual_payment_kinds[]`
- `language_codes[]`
- `delivery_preset_id`

Stage 1 may add a **rail label map** in application config (`ecocash` → “EcoCash”) without a full pack table, as long as it is not copied into ten components.

## Compliance and honesty

- Fiscalisation, CDPA, and consumer-law compliance are **not** claimed (`KNOWN_LIMITATIONS.md`).
- Privacy and Terms are drafts.
- Screenshot proof is evidence for the seller, not a payment.
- AI assistant sends aggregated totals to Gemini/Groq when keys exist — not a replacement for an accountant.

## Jobs to be done (Zimbabwe owner)

If Kwetuu is loved, an owner can open one screen after load shedding and answer:

1. How much money came in yesterday — cash USD, cash ZiG, EcoCash, bank?
2. Who owes me, and who do I owe?
3. Which products will run out this week?
4. Which orders are not collected or delivered?
5. What should I send on WhatsApp today?

Those five questions are the bar for Stage 1–4. Storefront polish, posters, academy, and diaspora shopping come after the till and the notebook are trustworthy.
