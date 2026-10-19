# Known limitations

- Not production-ready. See `PRODUCTION_GO_LIVE_CHECKLIST.md`.
- Customer checkout: pay on pickup, pay on delivery, quote. No EcoCash, InnBucks, or merchant Paynow.
- Platform Paynow is subscription billing only ($3/month Pro).
- One shop per cart. No marketplace commission.
- No product variants, no reviews, no customer accounts, no file uploads.
- Shop URLs are `{slug}.{APP_URL host}`. Wildcard DNS/TLS is an operator task. Cloud Run domain mapping alone is not enough.
- Draft preview is apex-only (`?preview=1`) because the session cookie is host-scoped.
- POS `create_sale` still accepts staff-supplied unit prices (intentional for the counter, unsafe if you exposed that RPC to shoppers).
- Offline stock is an estimate. Unsynced sales stay on the device after logout.
- Legal pages are drafts without an operator name or contact.
- Fiscalisation, CDPA, and consumer-law compliance are not claimed.
- CI default branch mismatch is fixed; historical merges to `master` may have skipped CI.
- Accessibility: code-level work exists; no screen-reader evidence this session.
- README is not the setup guide; `ENVIRONMENT_SETUP.md` is.
- Staging has a `locations` table and location-aware `create_product` / `create_sale` that are not in `supabase/migrations/` in this repo. Do not treat staging and git as identical until that drift is merged or reverted.
- Order rules: cash currencies, exact-cash, quote-required delivery, and automatic acceptance are enforced in SQL. Preparation minutes, cut-off text, and collection windows are shown to customers but are not calendar-enforced.
- Distance-based delivery fees, address geocoding, and multi-merchant carts are not implemented.
- The 200-feature product roadmap is not built. See `BUSINESSOS_AUDIT.md`.
