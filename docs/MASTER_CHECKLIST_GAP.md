# Master checklist gap analysis

**Updated:** 24 October 2026  
**Baseline:** `master` + verification tooling on branch `cursor/master-checklist-verify-dafe`  
**Legend:** Done · Partial · Missing · Ops (credentials / your decision)

Track verification runs in `docs/EXECUTION_STATUS.md`. Run gates via `docs/VERIFICATION.md`.

## P0 — verify before pilot

| # | Item | Status | Action |
|---|------|--------|--------|
| 1 | Staging migrations | Partial | `npm run staging:apply` (CI applies manifest) |
| 2 | Schema readiness | Partial | `npm run staging:readiness` |
| 3 | Integration tests | Partial | Add `SUPABASE_ACCESS_TOKEN`; `npm run verify:staging` |
| 4 | GitHub secrets | Ops | Token, staging Supabase, session, Resend, encryption key |
| 5 | Platform owner | Partial | Apply migration; `bootstrap_platform_owner` per bootstrap doc |
| 6 | Shop DNS/TLS | Ops | Wildcard `*.mykwetuu.com` |
| 7 | Manual pay playbook | Ops | Proof upload ≠ paid; seller confirms |
| 8 | Backup restore drill | Missing | Run per `docs/security/BACKUP_AND_RECOVERY.md` |
| 9 | TanStack CVE | Partial | Upgrade when build green (`docs/TANSTACK_GHSA_UPGRADE.md`) |

## §1–§23 summary

| § | Area | Status | Next build slices |
|---|------|--------|-------------------|
| 1 | Core foundation | Partial | Keep EXECUTION_STATUS current; remove dead placeholders as found |
| 2 | Accounts & permissions | Partial | Staging isolation tests; email provider on staging |
| 3 | Seller business mgmt | Done | Fulfilment depth, notification ops |
| 4 | Products & inventory | Partial | Variants (batch 6), branch transfers |
| 5 | Storefront & marketplace | Partial | Custom domains (batch 12), SEO depth |
| 6 | Customer shopping | Partial | Wishlist/returns; seller Paynow when approved |
| 7 | POS & receipts | Partial | Thermal printers (research only); dual-currency POS |
| 8 | Orders & fulfilment | Partial | Courier/tracking product |
| 9 | Payments | Partial | Enable billing when ready; sandbox Paynow |
| 10 | Notifications | Partial | Resend domain + flush job |
| 11 | AI adviser | Partial | Groq key; cost limits |
| 12 | Marketing analytics | Partial | Growth slice shipped; no ad spend/CAC |
| 13 | Finance & BI | Done | No fiscalisation without lawyer |
| 14 | Subscriptions | Partial | `BILLING_ENABLED` on deploy when chosen |
| 15 | Super admin | Partial | Search/suspend/tickets |
| 16 | Support & trust | Partial | Complaints/reviews done; ticket system missing |
| 17 | Security | Partial | Staging verify; pentest optional |
| 18 | Reliability & UX | Partial | a11y audit; monitoring |
| 19 | Testing | Partial | **This PR:** verify scripts + Playwright smoke |
| 20 | Integrations matrix | Partial | See `PRODUCT_AUDIT.md` connection table |
| 21 | 12 E2E workflows | Partial | See workflow table below |
| 22 | Cursor rules | Done | Vertical slices, no fake complete |
| 23 | Definition of done | Done | Documented in master prompt |

## §21 — twelve workflows

| # | Workflow | Status | Verification |
|---|----------|--------|--------------|
| 1 | Seller onboarding | Partial | Staging journey + future Playwright |
| 2 | Customer purchase (manual) | Partial | Integration + seller confirm in app |
| 3 | POS sale | Partial | Staging + receipt path |
| 4 | Shared inventory | Partial | `tenant-isolation` / race tests on staging |
| 5 | Delivery | Missing | Not in scope yet |
| 6 | Customer comms | Partial | Resend + outbox flush |
| 7 | Marketing analytics | Partial | Growth integration tests |
| 8 | AI adviser | Partial | Manual with `GROQ_API_KEY` |
| 9 | Subscription lifecycle | Partial | Billing off by default |
| 10 | Platform owner | Blocked | Bootstrap + MFA |
| 11 | Access isolation | Partial | `npm run verify:staging` |
| 12 | Recovery | Missing | Provider failure drills |

## Recommended phase order

1. **A — Truth:** `verify:staging` green (this PR’s tooling + your token).  
2. **B — Manual-pay pilot:** DNS, Resend, seller playbook.  
3. **C — Platform billing:** Paynow subs + owner bootstrapped.  
4. **D — Seller Paynow:** Provider approval → enable gate.  
5. **E — Long tail:** `docs/ROADMAP_REMAINING.md` batches 6–14.
