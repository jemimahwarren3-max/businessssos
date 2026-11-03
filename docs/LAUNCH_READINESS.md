# Kwetuu launch readiness

**Date:** 3 November 2026 (Africa/Harare)  
**Head:** repair stream on `cursor/system-debug-audit-dafe` (PR #117), based on `master` `2606441`  
**Companion docs:** `docs/debugging/SYSTEM_AUDIT.md`, `ISSUE_REGISTER.md`, `REPAIR_PLAN.md`  
**Method:** Repository inspection plus the repairs in this PR. Not a live Paynow charge, not a WhatsApp Cloud send, not a full multi-account browser sign-off.

This is a **stabilisation** document. It does not propose new features.

---

## Go / No-Go

| Audience                                                    | Recommendation                                                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Public launch** (anyone can sign up and pay)              | **No-Go**                                                                                       |
| **Controlled pilot** (5–10 invited shops, operator on call) | **Conditional Go** after this repair stream is on production **and** production SQL matches git |

You can launch a path-based shop (`/store/{slug}`) with some advanced features missing. You cannot launch while production schema can drift from the app, while transactional email may never flush, or while a logged-in stranger can read another shop’s setup stats (KW-001 — patched in this PR, not yet on production).

**Do not wait for:** automated WhatsApp, AI briefing, loyalty, courier APIs, custom domains, every storefront template tweak, variants, or a second-business switcher.

---

## Honest scorecard (the six questions)

| #   | Area                           | Answer                                  | Why                                                                                                                                                                                                                           |
| --- | ------------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Authentication                 | **Sometimes fails**                     | Session cookie + PKCE are sound. Email confirmation depends on GoTrue SMTP (unverified here). MFA recovery was blocked at aal1 until this PR. Google `next` is ignored on purpose; DB destination wins.                       |
| 2   | Business onboarding            | **Some steps fail**                     | Create-shop and “couldn’t load your shop” were real. Dual completion flags sent people through the wizard after they already had a shop. This PR sends them to `/setup`. Production SQL may still lack the journey RPCs.      |
| 3   | Products and inventory         | **Some bugs**                           | CRUD, images, and sale-time stock locks work in code. No variants, no branch transfers, POS uses the default location. Stock math for that path is RPC-atomic, not “unreliable totals”.                                       |
| 4   | POS and transactions           | **Some bugs**                           | `create_sale` is atomic with split tenders and an idempotency key. Parallel double-click can error instead of returning the same sale (not a duplicate). EcoCash/InnBucks on POS are cashier-attested, not provider-verified. |
| 5   | Online storefront and checkout | **Storefront works, checkout has bugs** | Publish gates, server quote, unpaid-until-confirmed are real. Shop Paynow is often off. Mail flush was crashing. `{slug}.mykwetuu.com` needs DNS/TLS; `/store/{slug}` works.                                                  |
| 6   | Subscriptions and payments     | **Partially integrated**                | Paynow hash + re-poll exist and do **not** trust a success URL. Cloud Run still sets `BILLING_ENABLED=false`. Shop Paynow is separate merchant keys. Manual shop payments stay pending until the seller confirms.             |

### Three biggest problems actually seen in this engagement

1. **Production/staging schema drift** — missing or overloaded RPCs looked like frontend bugs (“couldn’t load your shop”, Create shop failed).
2. **Dashboard launch cards did nothing** — hashes like `#launch-publish` never opened the storefront builder.
3. **Onboarding vs setup confusion** — two flags, so owners were sent to create-shop after they already had a business.

---

## Five launch gates

| Gate                         | Status                    | What still blocks                                                                                                                                                                                              |
| ---------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Account access**        | **Partial**               | Code paths exist. Not proven on production email (signup/reset). This PR unifies post-login to `/setup` or dashboard.                                                                                          |
| **2. Business operations**   | **Partial**               | POS/inventory RPCs are serious. Location/transfers/variants postponed. Need one live POS sale on staging after deploy.                                                                                         |
| **3. Ecommerce**             | **Partial if advertised** | Guest checkout + seller fulfilment exist. Confirmations depend on email flush (parser fixed here; secrets unverified). Advertise `/store/{slug}`, not `shop.mykwetuu.com`, until wildcard DNS exists.          |
| **4. Security and payments** | **Partial**               | No service-role in the browser. KW-001 (setup-progress leak) patched in this PR. Cashiers can no longer load `/reports` via API after this PR. Paynow not live-signed-off. Production SQL still operator-only. |
| **5. Real-world usability**  | **Fail**                  | You have been rescuing shop-load and launch buttons. Gate 5 passes only when an invited owner completes register → product → POS without you.                                                                  |

---

## Features implemented vs end-to-end

Legend: **E2E** = frontend + validation + DB + permissions + resulting state in code, remaining risk is config. **Partial** = real logic, incomplete or ops-blocked. **Frontend-only** = UI without the workflow. **Unverified** = cannot claim live.

| Feature                                | Code         | End to end?                         | Notes                                                       |
| -------------------------------------- | ------------ | ----------------------------------- | ----------------------------------------------------------- |
| Marketing site, Sign in, Start a store | E2E          | Unverified visually on every device | Distinguishes browse / create / account                     |
| Email sign-up / sign-in / logout       | E2E          | Unverified SMTP                     | HttpOnly session                                            |
| Google OAuth                           | Partial      | Unverified live                     | PKCE; destination from DB                                   |
| Password reset                         | Partial      | Unverified live                     | aal1 allowed on update in this PR                           |
| MFA TOTP                               | Partial      | Unverified live                     | Enforced when enrolled                                      |
| Create business / membership           | E2E          | Unverified on **production** SQL    | Staging manifest applies journey SQL                        |
| Guided onboarding + `/setup`           | Partial      | Partial                             | Resume + error UI improved this PR                          |
| Products CRUD, photos, categories      | E2E          | Unverified live                     | Shared POS + online catalogue                               |
| Product variants                       | Missing      | —                                   | Postpone                                                    |
| Stock adjust + sale deduction          | E2E          | Unverified live                     | Default location                                            |
| Branch transfers                       | Missing      | —                                   | Postpone                                                    |
| POS cart, sale, receipt, history       | E2E          | Unverified live                     | Split tenders in SQL                                        |
| Offline POS queue                      | E2E (device) | Unverified power-loss               | Sequential replay, same idempotency key                     |
| Cash drawer                            | E2E          | Unverified live                     | Cash sales need open session                                |
| Customer credit / deposits / lay-by    | E2E          | Unverified live                     | Notebook-delivery RPCs                                      |
| Store builder + 60 templates           | E2E          | Unverified live                     | Launch steps now route correctly                            |
| Publish / unpublish                    | E2E          | Unverified live                     | Eligibility RPC                                             |
| Public shop + cart + quote             | E2E          | Unverified live                     | Server prices                                               |
| Checkout + order                       | Partial      | Unverified live                     | Unpaid until Paynow poll or seller confirm                  |
| Shop Paynow                            | Partial      | Unverified                          | Often disabled by provider controls                         |
| Manual EcoCash / InnBucks (shop)       | E2E          | Unverified live                     | Proof ≠ paid                                                |
| Seller fulfilment                      | E2E          | Unverified live                     |                                                             |
| Marketplace `/stores` `/market`        | E2E          | Unverified live                     | Published + not suspended                                   |
| Platform subscription Paynow           | Partial      | **Off** in Cloud Run                | Do not flip `BILLING_ENABLED` without a product decision    |
| In-app notifications                   | E2E          | Unverified live                     |                                                             |
| Email receipts / status                | Partial      | **Ops**                             | Outbox real; flush cron fixed in this PR; Resend unverified |
| WhatsApp Cloud                         | Partial      | **Postpone for launch**             | No fake “sent”; `wa.me` still needs a human tap             |
| Reports / expenses                     | Partial      | This PR gates cashiers              | Dashboard KPIs stay available to cashiers                   |
| Staff invites + roles                  | Partial      | Unverified with a second account    | Writes gated; this PR gates financial reads                 |
| Platform admin                         | Partial      | Unverified                          | Env fallback until bootstrap                                |
| Capacitor / Tauri                      | Packaged     | Not launch gates                    | Postpone                                                    |

---

## Frontend-only or visual

- POS EcoCash / InnBucks **labels** (bookkeeping, not a provider).
- `wa.me` share and receipt buttons.
- Template preview **sample** products (marketing placeholders).
- Admin SMS notes, legal-name slots on `/privacy` `/terms`.
- Shop subdomain URLs until wildcard DNS exists.

None of these should be advertised as connected integrations.

---

## External services (do not mark connected until verified)

| Service                                     | Needed for                    | Launch impact                           |
| ------------------------------------------- | ----------------------------- | --------------------------------------- |
| Supabase Auth SMTP (Resend or other)        | Signup / reset mail           | Gate 1                                  |
| Production SQL apply (manual today)         | Any new RPC                   | **Blocks honest E2E**                   |
| Resend + `MAIL_FLUSH_SECRET` + working cron | Order email                   | Gate 3 confirmations                    |
| Paynow platform keys                        | Charging Kwetuu subscriptions | Optional if billing stays off for pilot |
| Paynow **shop** keys + provider controls    | Automated shop checkout       | Optional; manual pay works              |
| WhatsApp Cloud                              | Auto order WhatsApp           | **Postpone**                            |
| Wildcard DNS/TLS                            | `*.mykwetuu.com`              | Optional; use `/store/{slug}`           |
| Sentry                                      | Error visibility              | Useful, not a gate                      |
| Upstash Redis                               | Workspace cache               | Optional                                |

**Never test payments, stock deduction, or destructive SQL against live customer data.** Use staging `slajanbsfqjnuuiohbmg`. Production is `maidxfntfpnkcqnuhozo`.

---

## Bugs that prevent a confident public launch

Must be closed or accepted in writing:

1. **KW-001** setup-progress leak — **patched in this PR**; must be applied to staging **and** production.
2. **KW-002** production schema not in deploy — operator must confirm production function signatures after each release.
3. **KW-003 / KW-004** CI can cancel master / skip staging SQL — still open (needs explicit yes).
4. Email/WhatsApp delivery — KW-005 parser **patched**; secrets still **unverified**.
5. No second live account test (cashier vs owner) on staging in this session.

Remaining P2 (idempotency lock, locations, report currency mix) should not delay a **pilot**. They should not be ignored before a **paid public** launch.

---

## Security and data integrity risks

| Risk                                                | Severity | State                                                                                                            |
| --------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `get_setup_progress` readable by any signed-in user | P0       | Patched in PR; not on production until merge + SQL apply                                                         |
| Cashier `SELECT` via RLS on sales still exists      | P1       | API `getReports` / expense list now permission-gated; RLS member-read remains (POS needs product/customer reads) |
| Service-role key in frontend                        | —        | Not found                                                                                                        |
| Success URL activating payment                      | —        | Paynow poll + hash; shop manual stays pending                                                                    |
| POS EcoCash marked completed without provider       | Trust    | Documented; cashier attestation                                                                                  |
| Authed rate-limit fail-open                         | Accepted | Stops shop-load lockout                                                                                          |

---

## Safe to postpone (do not hold launch)

- Automated WhatsApp Cloud / Meta Groups
- AI business briefing / copilot
- Advanced analytics / growth experiments
- Loyalty and referrals
- Courier APIs and distance-based delivery
- Product variants and wholesale price lists
- Branch stock transfers and custom domains
- Multi-business switcher (SQL currently one shop per user)
- Tauri installer / signed Play Store APK
- Platform billing enforcement (`BILLING_ENABLED`) until Paynow sandbox is signed off

Keep the promise: **manage the business, sell the products, keep the records**.

---

## Proposed release posture

There is **no public release date** until Gates 1–4 pass on staging with named evidence.

**Pilot (recommended next):** as soon as PR #117 is merged, Cloud Run has the build, and an operator confirms production has `get_setup_progress` with `is_business_member` plus the onboarding journey RPC. Invite grocery, clothing, salon, and bakery owners. Watch them: register, add a product, take a cash sale, place a test shop order with **manual** payment.

**Public launch:** after at least one invited shop completes a full trading day without you completing operations for them, and after signup email is proven.

---

## What this repair stream already changed

- Launch centre steps open `/storefront` (not a dead dashboard hash).
- `get_setup_progress` requires membership.
- Mail-flush cron parses `{ email, whatsapp }` and does not fail when unconfigured.
- Post-login uses `setup_completed_at`.
- MFA recovery can set a password.
- Permission RPC errors fail the workspace load.
- Preview misses are not-live, not onboarding.
- Cashiers cannot load financial reports or expense lists through the API.

## What not to do next

Do not start another feature programme. Finish deploying this stream, confirm production SQL, walk one owner journey on staging, then recruit the pilot list. CI concurrency and production auto-migrate still need a separate yes.
