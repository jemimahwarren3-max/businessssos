# Kwetuu full platform audit

**Date:** 23 October 2026 (Africa/Harare)  
**Branch audited:** `master` (includes PR #42 reviews, PR #38 Resend, OAuth fix #40, storefront #41, audit-hardening follow-ups)  
**Method:** Repository review, `npm test`, `tsc`, `npm audit`, docs cross-check. Not a penetration test, legal opinion, or live staging browser pass.

**Gate:** **Not production-ready** for a general public launch. **Ready for a controlled beta** once staging migrations, GitHub secrets, DNS, and merchant payment playbook are in place (manual seller payments first).

---

## 1. Executive summary

Kwetuu is a TanStack Start + Supabase merchant OS with a real public storefront path: catalogue, cart, server-priced checkout, manual off-platform payments with proof upload, merchant mark-paid, optional per-shop Paynow (deferred), platform subscription billing (off in deploy), POS, invoices, marketplace browse, and 60+ shop themes.

**Two payment flows are correctly separated in code:** platform `PAYNOW_INTEGRATION_*` → subscription rows only; seller customer money → manual methods or each shop’s own Paynow credentials in `store_paynow_credentials`.

**Biggest launch blockers are operational, not missing checkout code:** apply SQL migrations on staging, configure Resend + mail flush, wildcard shop DNS/TLS, and run merchant training on “never mark paid from a screenshot alone.”

---

## 2. What works (evidence in repo)

| Area | Status | Notes |
|------|--------|--------|
| Merchant back office | Implemented | Products, stock, POS (incl. offline queue), customers, invoices, quotes, expenses, reports, roles, audit log, export |
| Storefront publish | Implemented | Requires ≥1 published product + fulfilment + payment method |
| Customer checkout | Implemented | Pickup/delivery/quote; pay on pickup/delivery; manual EcoCash/InnBucks/bank; optional shop Paynow |
| Manual payment verification | Implemented | `submit_store_order_proof`, merchant `mark_paid` / `reject_proof`; proof in private bucket |
| Order totals | Implemented | Priced in SQL (`create_store_order`); idempotency keys |
| Stock on online orders | Implemented | Reserve on order; conflicts fail closed |
| Shop subdomains | Implemented in app | Operator must provide `*.mykwetuu.com` DNS/TLS (Cloud Run limitation documented) |
| Google OAuth | Fixed on master (#40) | PKCE + callback server path |
| Transactional email | Queued | Sends only with `RESEND_API_KEY`, verified domain, `MAIL_FLUSH_SECRET`, flush workflow (#38) |
| Platform billing | Coded, deploy off | `BILLING_ENABLED=false` on Cloud Run; Paynow subs when keys + flag on |
| Reviews | Implemented (#42) | Verified-purchase reviews + merchant replies migration |
| Product photos | Implemented | `product-media` bucket, 2 MB sniff |
| Rate limits | Implemented | Auth, checkout, webhooks, marketplace RPC |
| Tenant isolation tests | Present | Staging integration suite (needs `SUPABASE_ACCESS_TOKEN` in CI) |

**Unit tests on master:** 125 passed, 42 skipped (integration skipped without staging token).

---

## 3. Payments (aligned with staged launch plan)

### Phase 1 — Manual seller payments (launch now)

- **Done in code.** Sellers configure instructions; customers upload proof + reference; seller verifies real account then marks paid.
- **Rule enforced:** uploads and Paynow redirects do not auto-mark `payment_status = paid` without verification path.
- **You should not** route seller customer sales through your platform Paynow account.

### Phase 2 — Kwetuu subscriptions (~US$7 / ZiG display)

- **Done in code:** `subscription_payments`, Settings → Billing, webhook + poll verify.
- **Not live:** deploy sets `BILLING_ENABLED=false`; `PAYNOW_*` not in deploy workflow (set on Cloud Run when ready).
- **Policy gap to decide:** publish during trial vs pay-before-first-publish (today: trial + read-only after expiry when billing on).

### Phase 3 — Per-seller Paynow automation

- **Code exists** (`shop-paynow.server.ts`); **rollout deferred** until Paynow confirms multi-merchant model and each seller has credentials.

---

## 4. Authentication and accounts

| Item | Status |
|------|--------|
| Google sign-in | Fixed (#40); requires Supabase redirect URLs + OAuth client |
| Email/password signup | UI exists; **staging GoTrue may disable email** — use Google or enable provider in Supabase |
| Staff login | Password on server; shop gate + per-staff password |
| Shopper accounts | Guest checkout + optional account; access-code order tracking |
| Session | httpOnly sealed cookie; `SESSION_SECRET` required |
| MFA | Platform admin path in audit-hardening work |
| Invites | Hashed tokens; owner role blocked on invite/staff-create schemas |

**Gap:** End-to-end auth not re-verified in this session against live `mykwetuu.com`.

---

## 5. Storefront and marketplace gaps

| Priority | Gap |
|----------|-----|
| P1 | Staging/production DB may lag git migrations (new: content sections, gallery, review responses, Oct 22 fixes) |
| P1 | Wildcard DNS/TLS for shop hosts |
| P2 | No product variants; single stock row per product |
| P2 | One shop per cart; no marketplace commission / split cart |
| P2 | Distance-based delivery fees, geocoding — not built |
| P2 | Draft preview apex-only (cookie host scope) |
| P3 | 200-feature roadmap mostly missing (`BUSINESSOS_AUDIT.md`) |
| P3 | Accessibility not independently verified |
| P3 | Marketing handoff branch (`copilot/storefront-marketing-handoff`) not merged — conflicts with current homepage/onboarding |

---

## 6. Security and compliance

| Item | Status |
|------|--------|
| RLS + security definer RPCs | Core pattern for storefront and billing |
| Paynow webhook | Rate limit + hash verify + poll before credit |
| `npm audit` | **Critical:** TanStack Start server-function XSS advisory (GHSA-qx66-fv34-fjm8) — run `npm audit fix` / upgrade when safe |
| Legal pages | Draft `/privacy`, `/terms`; placeholders for operator name |
| CDPA / fiscalisation | Not claimed |
| Backups | Workflow exists; restore not proven here |
| Secret scanning | `.env` gitignored; no full history scan |

Audit-hardening branch changes (invite hashing, integration test gates, webhook IP parsing) merged to master 23 Oct 2026.

---

## 7. Operations checklist (what you must configure)

**GitHub Actions repository secrets (deploy):**

- Required: `GCP_*`, `APP_URL`, `STAGING_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`
- Email: `RESEND_API_KEY`, `MAIL_FLUSH_SECRET`, optional `NOTIFY_FROM_EMAIL`

**Cloud Run (manual or extend deploy):**

- Your subs only: `PAYNOW_INTEGRATION_ID`, `PAYNOW_INTEGRATION_KEY`, `BILLING_ENABLED=true` when ready
- Optional: `GROQ_API_KEY`, `PLATFORM_ADMIN_USER_ID`, Redis, Sentry

**Supabase dashboard:**

- Google OAuth, redirect URLs, optional email provider
- Apply all migrations in `supabase/migrations/` to staging

**Not in GitHub:**

- Per-seller Paynow keys (Storefront UI, later)

---

## 8. Pull request hygiene (23 Oct 2026)

| Action | PRs / branches |
|--------|----------------|
| **Merged** | #42 verified reviews; #38 Resend; audit-hardening follow-ups on master |
| **Close as superseded** | #1, #8–#34, #24 — zero commits ahead of `master` |
| **Deferred** | `copilot/storefront-marketing-handoff` — rebase needed (conflicts with wonder UI / onboarding) |

---

## 9. Recommended order of work

1. Apply staging migrations; smoke-test checkout → proof → mark paid.
2. Set GitHub secrets; verify Resend domain; confirm mail flush job green.
3. Wildcard DNS for shops or stay on path URLs temporarily.
4. Merchant playbook for manual payments.
5. Upgrade TanStack Start when advisory fix is validated.
6. Enable platform billing when your Paynow subs account is ready.
7. Rebase and merge marketing handoff when you want extra homepage polish.
8. Contact Paynow for per-seller automation (Phase 3).

---

## 10. Related docs

- `KNOWN_LIMITATIONS.md` — honest product boundaries  
- `PRODUCTION_GO_LIVE_CHECKLIST.md` — evidence-based go-live gate  
- `BUSINESSOS_AUDIT.md` — feature-level 100/200 roadmap  
- `ENVIRONMENT_SETUP.md` — secrets and local dev  
- `STOREFRONT.md` — shopper/merchant storefront behaviour  
