# Kwetuu full system audit

**Date:** 13 November 2026 (Africa/Harare, UTC+2)  
**Git head reviewed:** `origin/master` at `7ee7db7` (after PR #138 Google Play AAB)  
**Branch used for this pass:** `cursor/full-audit-dafe` (audit artefact only; no product code changes)  
**Supersedes for breadth:** onboarding-era drafts that marked everything WORKING. Still read `docs/debugging/SYSTEM_AUDIT.md` (3 Nov 2026) for module tables and `docs/debugging/ISSUE_REGISTER.md` for ticket IDs.

**Method:** Repository inspection (91 route files, 109 SQL migrations, 120 merchant `createServerFn` handlers), automated `tsc`, ESLint, Vitest, GitHub Actions history, open PR review, staging manifest diff, and spot checks of money paths (POS, shop checkout, Paynow webhooks). **Not done:** live production Postgres diff, Paynow/EcoCash money on real rails, wildcard DNS, device matrix, or destructive tenant tests without `SUPABASE_ACCESS_TOKEN`.

---

## 1. Executive summary

Kwetuu is a **real multi-tenant merchant OS plus public shops**, not a demo. Money-moving operations are implemented as Postgres RPCs with membership checks, server-side prices, and idempotency on the critical paths. The application layer is large and coherent: **88 public routes**, **120 dashboard server functions**, unified storefront checkout, and extensive unit test coverage (**368 passing tests** in CI-shaped runs).

It is **not operationally closed**: production schema is still decoupled from deploy, several high-value SQL packs exist in git but are **absent from the staging manifest**, transactional email flush runs are **still failing on schedule** (13 Nov 2026), and merchant-facing import/Quick Add flows can still create junk catalogue rows faster than cleanup tooling ships.

| Dimension | Verdict |
| --------- | ------- |
| Architecture | **Keep** TanStack Start + Supabase + Paynow. Do not rebuild. |
| Core POS / shop money | **Sound in code**; live parity **unverified** on production DB |
| Security | **Improved since 3 Nov** on `get_setup_progress` (Node + SQL fix in git); **P1** read-permission gaps and **manifest drift** remain |
| Merchant UX (imports) | **PARTIAL** on `master`; **open PRs #139–#140** address intent, junk rows, bulk delete |
| Service / hybrid commerce | **Schema + routes in git**; **not applied on staging via CI manifest** |
| CI / deploy | Master `check` generally green; integration tests **skip without token**; mail cron **failing** |
| Mobile | Android AAB/signing on master (#138); Capacitor behaviour **unverified** in this pass |

**One-line status:** Strong core, growing surface area, **schema manifest lag** and **import cleanup** are the highest merchant-visible risks right now.

---

## 2. Code health (automated, this VM)

| Check | Result |
| ----- | ------ |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | Pass (14 warnings, 0 errors) |
| `npm test` (Vitest) | **106** files; **83** run, **23** skipped; **368** tests passed, **97** skipped |
| Engineering TODO/FIXME in `src/` | **0** (honest gaps live in docs and issue register) |

Skipped tests are mostly `tests/integration/*` gated on staging credentials, plus environment-specific suites.

---

## 3. Architecture snapshot

| Layer | Stack | Notes |
| ----- | ----- | ----- |
| UI | React 19, Tailwind 4, shadcn/Radix, Lucide | Merchant `AppShell`, marketing `MarketingShell` |
| Routing | TanStack Router file routes | 90 route modules under `src/routes/` |
| API | TanStack Start `createServerFn` | `business.functions.ts` (120), `storefront.functions.ts` (~45), `services.functions.ts` (~24) |
| DB | Supabase Postgres | Staging `slajanbsfqjnuuiohbmg`; production **manual** only |
| Auth | Supabase Auth + encrypted httpOnly session | PKCE Google; staff login by business name |
| Payments | Paynow Node (3 rails) + manual shop proofs | Single webhook `POST /api/webhooks/paynow` in `src/server.ts` |
| Cache | Optional Redis (workspace 60s) | Skip-safe |
| Deploy | Cloud Run from `master` after CI | `BILLING_ENABLED=false` in deploy env |

### Route inventory (merchant highlights)

Authenticated ERP includes: dashboard, setup, onboarding, inventory, sales, services, bookings, storefront, online orders, customers, invoices, quotes, lay-by, expenses, reports, cash drawer, team, billing, help, assistant, branches, purchase orders, and settings (account, business, data import, payments, audit log).

Public shop: `/store/$slug/**` (cart, checkout, product, service detail, order tracking, shopper account).

Platform: `/admin/**` (businesses, billing, health, orders, communications, audit).

---

## 4. What shipped on `master` since the 3 Nov system audit

Recent merges materially change merchant daily use:

| PR / theme | What it adds | Audit note |
| ---------- | ------------ | ---------- |
| #131 Quick Add file import | PDF/photo/batch sales parse path | AI + spreadsheet; **no junk filter on master** |
| #132 Team QR | Invite + staff sign-in QR | UX; security = existing invite tokens |
| #129 Stock assistant | Role + permissions + E2E | Import/sales boundaries enforced in SQL |
| #133 Mobile home | Quick actions, Quick Add FAB | Surfaces parse errors to merchants |
| #134 Sales | Remove power-cut banner | Polish |
| #135 Mobile header | Layout fix | Polish |
| #137 Smart Excel + download | `rowsToRecordsSmart`, APK download page | **Merged**; improves column mapping for imports |
| #138 Google Play | AAB CI, submission doc, Play button | **Ops**: keystore secrets human-owned |

**Open (not on master at audit time):**

| PR | Branch | Gap it closes |
| -- | ------ | ------------- |
| #136 | `cursor/excel-smart-columns-dafe` | Further smart-column work (may overlap #137) |
| #139 | `cursor/quick-add-inventory-intent-dafe` | Inventory **intent**, fuzzy match, junk row skip, `product_import` from SOH sheets |
| #140 | `cursor/inventory-bulk-delete-dafe` | Bulk select/delete, **Select likely junk** |

---

## 5. Module-by-module status (November 2026)

Status key: **WORKING** · **PARTIAL** · **BROKEN** · **MISSING** · **UNVERIFIED**

### A. Marketing & auth — PARTIAL

- Landing, pricing, `/stores` gallery, templates: **WORKING** (real published shops).
- Email sign-up on staging: often **blocked by GoTrue** unless Email provider enabled.
- Google OAuth: **WORKING** start; post-callback `next` URL still **ignored** (KW-010).
- Session + MFA + protected layout: **WORKING** in code.

### B. Onboarding & setup — PARTIAL

- Journey wizard + `create_business_with_owner` jsonb: **WORKING** on staging manifest.
- Dual flags `onboarding_completed` vs `setup_completed_at`: still **PARTIAL** (KW-013).
- `get_setup_progress`: **Mitigated in git** — `assertMember` in `getSetupProgress` (`business.server.ts`) and SQL membership in `20261103100000_get_setup_progress_member.sql` + stricter body in `20261104010000_security_hardening.sql`. **Staging manifest includes the member fix, not `security_hardening`.** Direct PostgREST call remains unsafe until DB has member check (KW-001 → **PARTIAL FIX**).

### C. Products, inventory, imports — PARTIAL (merchant pain zone)

| Capability | Master | With #139 / #140 |
| ---------- | ------ | ---------------- |
| Product CRUD, images, categories | WORKING | Same |
| CSV/XLSX import (`/inventory` Import) | WORKING + smart headers (#137) | Same |
| Quick Add (AI parse) | WORKING for sales/purchase/expense; **inventory intent weak** | #139 improves |
| Junk rows (totals, credits, allergies) | **Not filtered on master** | #139 filter + #140 bulk delete |
| Bulk archive/delete | **MISSING on master** | #140 `archive_products` RPC |
| Variants / transfers | **MISSING** (documented) | No change |

**Risk:** Merchants can import SOH sheets via Quick Add or Import and get hundreds of bad `products` rows. Cleanup without #140 is manual one-by-one delete.

### D. POS & sales — WORKING (caveats)

- `create_sale` 10-arg split tenders, stock in same transaction: **WORKING**.
- Offline queue + idempotency key: **WORKING**.
- Cash drawer required for cash: **WORKING**.
- EcoCash/InnBucks on POS: **bookkeeping only**, not provider verify (by design).
- Location id on sale: **PARTIAL** (often omitted by Node) (KW-021).

### E. Storefront & checkout — WORKING (code)

- Server quote `quote_store_cart`, unpaid until confirmed: **WORKING**.
- Manual payment proofs, Paynow shop credentials isolated from platform: **WORKING**.
- Subdomain `{slug}.host`: app rewrite **WORKING**; wildcard DNS/TLS **ops** (KW-024).
- 60 template layouts, launch eligibility RPCs: **WORKING**.

### F. Service & hybrid commerce — PARTIAL (schema drift)

**In git but not in `STAGING_MIGRATION_MANIFEST` (as of this audit):**

- `20261104010000_security_hardening.sql`
- `20261104090000` through `20261104095000` (service commerce, bookings, POS service lines, public booking, reports)
- `20261105131754_allow_pexels_product_images.sql`

Routes exist (`/services`, `/bookings`, `store.$slug/services/$serviceId`, commerce model in `settings.business`). **Staging CI will not apply this pack** until manifest entries and readiness probes exist. **Production** almost certainly lacks it unless applied manually.

### G. Team, permissions, stock assistant — WORKING

- Granular permissions + role boundaries (Nov migrations in manifest): **WORKING**.
- Stock assistant role (#129): **WORKING** in git + manifest.

### H. Notifications — PARTIAL / ops BROKEN

- In-app notifications: **WORKING**.
- Outbox + Resend + WhatsApp Cloud: code **WORKING** when secrets set.
- Scheduled **Flush mail outbox** workflow: GitHub shows **failure** 13 Nov 2026 14:03 CAT — investigate `APP_URL`, `MAIL_FLUSH_SECRET`, provider errors, or zero configured channels (KW-005 evolved: parser shape fixed in workflow; **runtime send still failing**).

### I. Billing & platform Paynow — PARTIAL

- Platform vs shop vs launch fee separation: **WORKING**.
- Webhook hash + re-poll: **WORKING**.
- `BILLING_ENABLED=false` in deploy: subscriptions **not enforced** live (KW-028).

### J. Mobile & desktop — PARTIAL

- Merchant Android: APK download + #138 AAB pipeline: **on master**.
- Google Play submission: **human** Play Console + keystore secrets.
- Capacitor/Tauri: packaged, **UNVERIFIED** this pass.

### K. Admin console — WORKING (code)

- Platform admin RPCs, impersonation guards, audit reader: present. Live use **UNVERIFIED**.

---

## 6. Security audit

| ID | Severity | Finding | Status Nov 13 |
| -- | -------- | ------- | ------------- |
| KW-001 | P0 | `get_setup_progress` cross-tenant read via DEFINER | **Mitigated in app + member migration in manifest**; apply `security_hardening` on all envs; verify no anon grant |
| KW-014 | P1 | Financial reads (`getReports`, expenses) without `assertPermission` | **Open** — RLS still allows member SELECT |
| KW-002 | P1 | Production schema not tied to deploy | **Open** |
| KW-003 | P1 | CI cancel-in-progress on shared concurrency | **Open** (check current `ci.yml` on master) |
| KW-004 | P1 | Green CI without staging token | **Open** |
| KW-005 | P1 | Mail flush cron | **Parser fixed**; **scheduled run still failing** |
| KW-010–016 | P1 | Auth/onboarding/notifications | Mostly **open** (see register) |
| Paynow | — | Redirect never marks paid; webhook re-polls | **Sound** |
| Service role in client | — | ESLint guard + publishable key only | **Sound** |
| Tenant writes | — | Session JWT + RPC guards | **Sound**; isolation test when token present |

No new P0 cross-tenant **write** holes identified in this pass.

---

## 7. Database & staging manifest drift

| Metric | Value |
| ------ | ----- |
| SQL files in `supabase/migrations/` | **109** |
| Files in `STAGING_MIGRATION_MANIFEST` | **48** (incremental apply list by design) |
| **Actionable gap:** service-commerce pack + `security_hardening` + Pexels RPC | **8 files** not listed |
| **Actionable gap:** `archive_products` (PR #140) | **Not on master**; not in manifest |

**Risk:** Developers assume “merged to master” equals “staging has RPC”. Only manifest-listed files run in CI `Apply staging SQL`. Service bookings on staging **likely error** if UI routes hit missing tables/RPCs.

**Readiness checks** in manifest already probe split tenders, unique `create_business_with_owner`, `get_setup_progress` member fix, stock assistant, etc. **Add probes** for `commerce_model`, `services`, `archive_products` when those migrations land.

---

## 8. Payments & money paths (condensed)

```
Shopper checkout → quote_store_cart → create_store_order (unpaid)
  → Paynow initiate (shop keys) OR manual note → pending
  → webhook / poll → confirm_shop_paynow_payment OR seller record_store_order_payment

POS → create_sale (catalogue prices, tenders, stock)

Platform → subscription Paynow → paynow_confirm_payment (separate keys)
```

**Rules still correct in code:** platform Paynow never collects shop customer money; client prices on checkout ignored; online orders do not call `create_sale` until merchant records payment.

---

## 9. Import / Quick Add vertical audit (your recent pain)

### Current behaviour on `master`

1. **Quick Add** (`parseQuickEntryFn`): AI classifies sale / purchase / expense / customer; spreadsheet lines supported; product match by catalogue name; purchases can adjust stock.
2. **Import dialog** on inventory: column aliases + **smart header detection** (`rowsToRecordsSmart` in `spreadsheet.ts`).
3. **No** dedicated “inventory only” intent on master; mixed SOH sheets can be interpreted as sales or create ambiguous product names.
4. **No** server-side junk-row filter on master.
5. **No** bulk delete on master.

### Target state (open PRs)

- **#139:** Explicit intent (`inventory` vs sales), fuzzy product match, skip junk rows, optional cost/retail columns, create product on restock.
- **#140:** Select products, delete up to 500, **Select likely junk** (shared label rules).

### Operational cleanup playbook (after #140 deploy)

1. Inventory → **Select likely junk** → **Delete selected** (permission: `inventory.import`).
2. Search `total`, `credit`, `allerg`; use **Load more** for older pages.
3. Export XLSX backup from inventory before large deletes.
4. Re-import with **Import** (not Quick Add) when the sheet is pure SOH; use #139 intent when live.

---

## 10. CI, deploy, and operations

| Item | Finding |
| ---- | ------- |
| Unit tests | Gate `check` job |
| Integration tests | 24 files under `tests/integration/`; **skip** without `SUPABASE_ACCESS_TOKEN` |
| Staging SQL in CI | Runs manifest; **exits 0 if token missing** (KW-004) |
| E2E | `continue-on-error: true` against live URL |
| Master recent | #138 merge path; individual workflow failures on **flush-mail** |
| Production backup | Nightly workflow **success** (13 Nov 2026) |

---

## 11. Test coverage map

| Area | Unit tests present | Integration |
| ---- | ------------------ | ----------- |
| Tenant isolation | Partial in unit mocks | `tenant-isolation.test.ts` (staging) |
| Payment safety | Yes | `payment-safety.test.ts` |
| Split tenders | Yes | Yes |
| Commerce model | `commerce-model.test.ts` | No |
| Quick Add / junk rows | On PR branches | No |
| Storefront launch | Yes | Partial |
| Permissions / roles | Yes | Yes |

**Gap:** No automated regression for “bad import → junk product names” on master until #139 tests merge.

---

## 12. Prioritised recommendations

### Batch A — Stop merchant-visible harm (no product redesign)

1. **Merge #140** (bulk delete + junk select) and add `20261111130000_archive_products.sql` to **staging manifest** + readiness probe.
2. **Merge #139** (Quick Add inventory intent + junk filter); reconcile overlap with #136/#137 smart columns.
3. Document in **Help** (already drafted on #140 branch) for cleanup steps.

### Batch B — Close schema / security drift

4. Add to manifest: `20261104010000_security_hardening.sql` and full **service-commerce** chain **or** hide service routes until applied.
5. Reclassify **KW-001** to **Fixed** only after staging + production probes confirm `get_setup_progress` raises `B0020` for non-members (direct RPC test).

### Batch C — Operational reliability (approval may apply)

6. Fix **flush-mail** failures (secrets, Resend domain, APP_URL pointing at current Cloud Run revision).
7. KW-003 / KW-004 CI hardening (concurrency per ref; fail master without staging token).
8. Production schema **read-only drift gate** before deploy (KW-002).

### Batch D — Product honesty (document, do not invent)

9. Keep claiming **no variants**, **no branch transfers**, **no provider-verified POS EcoCash**.
10. Wildcard shop hosts and live billing remain **ops/product** decisions.

---

## 13. Issue register delta (update `ISSUE_REGISTER.md`)

| ID | Change since 3 Nov |
| -- | ------------------ |
| KW-001 | **Partial fix**: Node `assertMember` + `20261103100000_*` in manifest; stronger SQL in `security_hardening` **not** in manifest |
| KW-005 | Workflow parser updated; **cron still failing** — treat as **Open** until green runs |
| NEW | **KW-037** (proposed): Service-commerce SQL not in staging manifest — routes may 500 on staging |
| NEW | **KW-038** (proposed): Import/junk catalogue rows — **mitigation in flight** PRs #139–#140 |

---

## 14. References

| Document | Purpose |
| -------- | ------- |
| `SCHEMA_AUDIT.md` | Table naming (`businesses` not `stores`) |
| `FEATURE_AUDIT.md` | Stack and stage map |
| `docs/KNOWN_LIMITATIONS.md` | Honest merchant-facing limits |
| `docs/debugging/SYSTEM_AUDIT.md` | Deep module tables (3 Nov) |
| `docs/debugging/ISSUE_REGISTER.md` | KW-* tickets |
| `docs/debugging/REPAIR_PLAN.md` | Batched repair order |
| `docs/GOOGLE_PLAY_MERCHANT_SUBMISSION.md` | Android release ops |

---

## 15. Audit conclusion

Kwetuu’s **core commerce engine is legitimate and well-tested in unit scope**. The biggest gaps for a Zimbabwe merchant using imports and Quick Add today are **workflow** (wrong intent, junk rows) and **cleanup tooling** (bulk delete), both addressed in open PRs. The biggest **platform** gaps are **staging manifest lag** for service commerce and security hardening, **production schema drift**, and **broken scheduled mail flush**.

**Recommended immediate sequence:** merge #140 → merge #139 → extend staging manifest → verify flush-mail → run staging integration suite with token → only then treat service/hybrid routes as launch-ready.
