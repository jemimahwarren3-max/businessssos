# Workflow verification map

Maps the master checklist §21 workflows to automated evidence. Update after each green run.

| # | Workflow | Automated evidence | Command / location |
|---|----------|-------------------|-------------------|
| 1 | Seller onboarding | Partial | `tests/integration/transactional.test.ts`; E2E auth TBD |
| 2 | Customer purchase (manual) | Partial | `tests/integration/payment-safety.test.ts`, storefront unit tests |
| 3 | POS sale | Partial | `tests/integration/cash-drawer.test.ts` |
| 4 | Shared inventory | Partial | `tests/integration/tenant-isolation.test.ts` |
| 5 | Delivery | Missing | No courier slice |
| 6 | Customer comms | Partial | `tests/integration/shopper-emails.test.ts` (needs Resend for live) |
| 7 | Marketing analytics | Partial | `tests/integration/growth-intelligence.test.ts` |
| 8 | AI adviser | Partial | Manual + `tests/growth-intelligence.test.ts` (unit) |
| 9 | Subscription lifecycle | Partial | `tests/integration/billing-security.test.ts`, `tests/billing-write.test.ts` |
| 10 | Platform owner | Partial | `tests/integration/platform-owner-security.test.ts`; bootstrap Ops |
| 11 | Access isolation | Partial | `tests/integration/tenant-isolation.test.ts`, `permissions.test.ts` |
| 12 | Recovery | Missing | Drill not scripted |

**Full staging gate:** `npm run verify:staging` (requires `SUPABASE_ACCESS_TOKEN`).

**Deployed read-only:** `npm run test:e2e`.
