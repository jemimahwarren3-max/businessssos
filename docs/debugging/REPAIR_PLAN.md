# Kwetuu Repair Plan

**Date:** 2026-11-03

---

## Assessment

The application is fundamentally sound. There are no P0 (critical) or P1 (high) issues. The repair work is limited to P2 medium items and P3 polish.

---

## Batch 1: TypeScript cleanup + dashboard redirect (ISS-001, ISS-003)

**Effort:** Small
**Risk:** None — additive changes only

1. Fix 6 implicit `any` errors in store/market routes → `tsc --noEmit` clean
2. Add dashboard → `/setup` redirect for businesses with `setup_completed_at === null`
3. Verify: TypeScript passes, existing businesses still go to dashboard

## Batch 2: Unit tests for critical paths (ISS-002)

**Effort:** Medium
**Risk:** None — additive only

1. Add tests for billing gate functions (`canWriteForSubscription`, `canOperateForSubscription`)
2. Add tests for format utilities (`readableError`, `formatMoney`, `friendlyDate`)
3. Add tests for schema validation (`createBusinessSchema`, `onboardingConfigSchema`)
4. Verify: `vitest run` passes

## Batch 3: Deployment verification (ISS-004, ISS-008)

**Effort:** Small
**Risk:** Low — migration is backward-compatible

1. Verify Resend email configuration in staging
2. Apply onboarding migration to staging (requires approval)
3. Verify: Admin health check shows email OK, new RPCs callable

## Deferred

- ISS-005 (auth.role deprecation) — future migration, no urgency
- ISS-006 (console.error density) — informational, no action needed
- ISS-007 (trial POS block) — product decision needed from owner
