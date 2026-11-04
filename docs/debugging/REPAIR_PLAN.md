# Kwetuu Repair Plan

**Date:** 3 November 2026 (Africa/Harare)  
**Head:** `2606441`  
**Rule:** Do not start Stage 4 until the owner approves this plan.  
**Rule:** One batch at a time. Regression on related modules after each batch.  
**Rule:** No production SQL apply, no billing flip, no paid third-party signup, no redesign.

This plan groups `ISSUE_REGISTER.md` into safe batches. It does **not** attempt every module at once.

---

## Dependencies

```
KW-001 (setup progress RLS)
    └── independent; do first

KW-005 (flush-mail parser)
    └── KW-016 (ops verify send) depends on KW-005

KW-002 (prod schema probe)
    └── KW-004 (CI fail if no token) can ship together
    └── KW-003 (concurrency) is related CI but needs separate approval
    └── KW-020 / location POS should wait until we know production `create_sale` arity

KW-013 (auth flags)
    └── KW-010 (OAuth next) should use the same destination helper

KW-014 (report permissions)
    └── independent of KW-001; do after P0
```

---

## Batch 1: Close the cross-tenant read (P0)

**Issues:** KW-001  
**Risk:** Low, additive `CREATE OR REPLACE` + Node `assertMember`  
**Destructive?** No  
**Approval:** Authorised as a clear, non-destructive bug once Stage 4 is approved

1. New migration `YYYYMMDDHHMMSS_get_setup_progress_member.sql`:
   - Replace `get_setup_progress` with the same JSON shape.
   - `IF NOT is_business_member(_business_id, auth.uid()) THEN RAISE …`.
   - Keep `GRANT` to `authenticated` only (not anon).
2. `getSetupProgress` in `business.server.ts`: `assertMember` (or `assertPermission`) before RPC.
3. Add `get_setup_progress` to the staging manifest (always replace).
4. Staging isolation test: user A RPC on user B’s id fails.
5. Add readiness check so missing membership clause fails staging-readiness.

**Regression:** `/setup` for a real owner still loads; management vs full path unchanged.

**Do not:** rewrite onboarding UI in this batch.

---

## Batch 2: Make mail flush and CI tell the truth

**Issues:** KW-005 (code), KW-003 / KW-004 (approval)  
**Risk:** Low for parser; medium for CI contract

### 2a: no extra approval

1. Fix `.github/workflows/flush-mail.yml` to read `{email,whatsapp}`.
2. Treat “both unconfigured” as a successful no-op (exit 0) so the cron is not a permanent red herring.
3. Fail on HTTP 401 or `failed > 0`.
4. Fixture test for the parser or a documented example JSON in `tests/`.

### 2b: implemented on the repair branch (KW-003 / KW-004)

1. CI concurrency: `github.workflow` + `github.ref`. Do not cancel `master`/`main`.
2. On push to `master`/`main`, missing `SUPABASE_ACCESS_TOKEN` fails `check` (`REQUIRE_STAGING_SQL`).
3. Leave `workflow_dispatch` deploy as break-glass.

**Regression:** Staging SQL is last-writer-wins CREATE OR REPLACE. Unit tests still run on PRs without a token. Production SQL is still not auto-applied.

---

## Batch 3: Auth and onboarding decisions use one rule

**Issues:** KW-010, KW-011, KW-012, KW-013, KW-015, KW-023  
**Risk:** Medium, redirect behaviour for every login

1. Extend `destinationAfterAuth` to accept `setupCompletedAt` + membership.
   - no shop → `/onboarding`
   - shop, setup incomplete → `/setup`
   - shop, setup complete → `/dashboard`
   - admin, no shop → `/admin`
2. `resolvePostAuthPathForUser` and staff login use that helper.
3. Google `next` is ignored unless it matches the helper (document).
4. `updatePassword` allows aal1 recovery only.
5. `loadWorkspace` fails closed on `get_my_permissions` error (unless skippable missing RPC).
6. Preview miss ≠ `/onboarding`.
7. `/setup` shows retry on progress error.

**Regression:** Existing shops with `setup_completed_at` set still land on dashboard. New shops still reach `/setup`. Dashboard workspace-error must **not** return.

**Do not:** change `create_business_with_owner` columns in this batch.

---

## Batch 4: Staff cannot read finances through the API

**Issues:** KW-014  
**Risk:** Medium, cashiers who bookmarked `/reports` will get a denied error

1. `assertPermission(..., 'reports.financial')` in `loadReports` and `getReports`.
2. `assertPermission` for expense **list** (`expenses.view` if it exists, else `reports.financial`). Confirm the key in `granular_permissions` before inventing one.
3. Dashboard: keep operational KPIs if cashiers are meant to see today-sales; if not, gate `getDashboard` the same way. **Confirm product intent** if unclear, default: cashiers keep POS dashboard numbers, lose `/reports` export.
4. Staging test: cashier JWT denied on `getReports`.

**Do not:** rewrite RLS SELECT policies in this batch.

---

## Batch 5: Production schema visibility (no apply)

**Issues:** KW-002  
**Risk:** Low if read-only  
**Approval:** Required (production access)

1. Script that lists critical function signatures (`create_sale`, `create_business_with_owner`, `get_setup_progress`, `get_business_feature_flags`, `complete_notification_outbox`).
2. Compare to expected arities from git.
3. Print a drift report. **Stop.** Do not apply.
4. Owner decides whether to apply the same staging manifest to production in a later, dedicated change.

**Do not:** point `apply-staging-sql.mjs` at production. The refuse-production-ref guard stays.

---

## Batch 6: POS correctness polish

**Issues:** KW-020, KW-021, KW-022  
**Depends on:** Batch 5 if production `create_sale` is still 8-arg

1. Advisory lock in `create_sale` (replace function, keep 10-arg body and tenders).
2. Pass `_location_id` from POS/inventory when the user selected a branch.
3. Reports: group by rail/currency without summing across currencies.

**Regression:** Split-tender integration tests; cash drawer still counts cash only.

---

## Deferred (do not start in this audit unless asked)

| Item                                 | Why deferred                       |
| ------------------------------------ | ---------------------------------- |
| KW-016 live Resend/WhatsApp          | Paid/review secrets; after 2a      |
| KW-024 wildcard shop hosts           | DNS/TLS spend                      |
| KW-028 / `BILLING_ENABLED=true`      | Product + Paynow live test         |
| KW-033 variants / transfers          | New schema; out of stability scope |
| KW-034 second business / switcher    | Contradicts current “one shop” SQL |
| KW-025 empty shops in `/stores`      | Product copy                       |
| KW-026 ESLint dynamic import         | Hygiene; Batch 1–4 first           |
| KW-027 fail-closed money rate limits | After production RPC is guaranteed |
| KW-030 unused resume helpers         | Dead-code cleanup                  |
| Capacitor / Tauri verification       | Separate device pass               |
| Legal entity names                   | Operator content                   |

---

## Proposed database changes (for approval)

| Change                                             | Batch    | Destructive?               | Needs approval before execute         |
| -------------------------------------------------- | -------- | -------------------------- | ------------------------------------- |
| Replace `get_setup_progress` with membership check | 1        | No                         | Stage 4 go-ahead only                 |
| Flush-mail workflow only                           | 2a       | No                         | Stage 4 go-ahead only                 |
| CI concurrency / fail-on-missing-token             | 2b       | No                         | **Explicit**, affects all PRs        |
| `destinationAfterAuth` signature (Node only)       | 3        | No                         | Stage 4 go-ahead only                 |
| `assertPermission` on reads                        | 4        | No                         | Stage 4 go-ahead only                 |
| Production **probe**                               | 5        | No                         | **Explicit** (prod credentials)       |
| Production **apply**                               | later    | Can lock/rebuild functions | **Stop, ask again**                  |
| `create_sale` advisory lock                        | 6        | No if body preserved       | Stage 4 + confirm 10-arg on target DB |
| New tables (variants, transfers, switcher)         | deferred | Yes (new objects)          | Not proposed                          |

---

## External dependencies (none will be purchased here)

- Resend domain + `RESEND_API_KEY` / `NOTIFY_FROM_EMAIL`
- `MAIL_FLUSH_SECRET` in GitHub + Cloud Run
- WhatsApp Cloud token + phone number id + Meta templates
- Paynow shop keys + provider controls if merchants should take Paynow
- Wildcard DNS/TLS for `*.mykwetuu.com`
- Production Supabase access for Batch 5 probe

---

## Verification after each approved batch

1. `npx tsc --noEmit`
2. `npm run lint`
3. `npm test` (unit; integration if token present)
4. Related UI path (setup, login destination, reports, POS, as applicable)
5. Update this file and `ISSUE_REGISTER.md` status
6. **Do not** claim production Paynow/WhatsApp/email work unless that batch’s live check ran

---

## Definition of done for Stage 4 (when approved)

Batch 1 merged and tested is the minimum security bar. Batches 2a + 3 restore the reliability story that #114–#115 started. Batches 2b, 4, 5, 6 are the rest of “stable”, not a redesign.

A later `FINAL_DEBUGGING_REPORT.md` will list what was fixed, what stayed unverified, and what still needs operator secrets.
