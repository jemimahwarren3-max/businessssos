import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authedRateLimit } from "@/lib/rate-limit.server";
import {
  getMfaStatus,
  enrollTotp,
  verifyTotpEnrollment,
  challengeTotp,
  verifyTotpChallenge,
} from "@/lib/auth/mfa.server";
import { setServerSession } from "@/lib/auth/session.server";
import {
  getAdminStats,
  getAdminPlatformFx,
  isPlatformAdmin,
  listAdminPayments,
  listAdminSubscriptions,
  overrideSubscription,
  setAdminPlatformFx,
} from "./admin.server";

// authedRateLimit already composes requireSupabaseAuth internally and
// re-passes its context, so context.userId/context.tokens stay available
// with no other changes needed at each call site below.
const adminRateLimit = [
  authedRateLimit({ keyPrefix: "admin-api", maxRequests: 30, windowSeconds: 60 }),
] as const;

// Tighter — these three accept a 6-digit TOTP code, exactly the kind of
// code-guessing surface that normally gets a tight attempt throttle.
const adminMfaRateLimit = [
  authedRateLimit({ keyPrefix: "admin-mfa", maxRequests: 8, windowSeconds: 60 }),
] as const;

// Boolean-plus-MFA-status check, never throws — used by the /admin route's
// beforeLoad to decide whether to render a real 404 (not admin), an MFA
// gate (admin but not yet aal2 this session), or the real dashboard.
export const checkPlatformAdmin = createServerFn({ method: "GET" })
  .middleware(adminRateLimit)
  .handler(async ({ context }) => {
    const isAdmin = isPlatformAdmin(context.userId);
    if (!isAdmin) return { isAdmin: false as const };
    const mfa = await getMfaStatus(context.tokens);
    return { isAdmin: true as const, ...mfa };
  });

export const enrollAdminMfaFn = createServerFn({ method: "POST" })
  .middleware(adminRateLimit)
  .handler(async ({ context }) => {
    if (!isPlatformAdmin(context.userId)) throw new Error("Not found.");
    return enrollTotp(context.tokens);
  });

const verifyEnrollSchema = z.object({
  factorId: z.string().min(1),
  code: z.string().trim().length(6),
});
export const verifyAdminMfaEnrollmentFn = createServerFn({ method: "POST" })
  .middleware(adminMfaRateLimit)
  .inputValidator((data: unknown) => verifyEnrollSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (!isPlatformAdmin(context.userId)) throw new Error("Not found.");
    const { accessToken, refreshToken } = await verifyTotpEnrollment(
      context.tokens,
      data.factorId,
      data.code,
    );
    // The verify call upgrades the session to aal2 — reseal the cookie with
    // the new tokens now, or the next request would still read back aal1.
    await setServerSession({ accessToken, refreshToken });
    return { ok: true };
  });

const challengeSchema = z.object({ factorId: z.string().min(1) });
export const challengeAdminMfaFn = createServerFn({ method: "POST" })
  .middleware(adminMfaRateLimit)
  .inputValidator((data: unknown) => challengeSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (!isPlatformAdmin(context.userId)) throw new Error("Not found.");
    return challengeTotp(context.tokens, data.factorId);
  });

const verifyChallengeSchema = z.object({
  factorId: z.string().min(1),
  challengeId: z.string().min(1),
  code: z.string().trim().length(6),
});
export const verifyAdminMfaChallengeFn = createServerFn({ method: "POST" })
  .middleware(adminMfaRateLimit)
  .inputValidator((data: unknown) => verifyChallengeSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (!isPlatformAdmin(context.userId)) throw new Error("Not found.");
    const { accessToken, refreshToken } = await verifyTotpChallenge(
      context.tokens,
      data.factorId,
      data.challengeId,
      data.code,
    );
    await setServerSession({ accessToken, refreshToken });
    return { ok: true };
  });

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware(adminRateLimit)
  .handler(async ({ context }) => {
    const [subscriptions, payments, stats, fx] = await Promise.all([
      listAdminSubscriptions(context.userId, context.tokens),
      listAdminPayments(context.userId, context.tokens),
      getAdminStats(context.userId, context.tokens),
      getAdminPlatformFx(context.userId, context.tokens),
    ]);
    return { subscriptions, payments, stats, fx };
  });

const fxSchema = z.object({
  usdToZwg: z.coerce.number().positive().max(1_000_000),
  source: z.string().trim().min(3).max(120),
  effectiveOn: z.string().min(8).max(12),
  notice: z.string().trim().max(400),
});

export const setPlatformFxFn = createServerFn({ method: "POST" })
  .middleware(adminRateLimit)
  .inputValidator((data: unknown) => fxSchema.parse(data))
  .handler(async ({ data, context }) => {
    await setAdminPlatformFx(context.userId, context.tokens, data);
    return { ok: true };
  });

const overrideSchema = z.object({
  businessId: z.string().uuid(),
  plan: z.enum(["free", "starter", "business", "pro"]),
  status: z.enum(["trialing", "active", "past_due", "canceled", "incomplete", "unpaid"]),
  currentPeriodEnd: z.string().min(1),
  reason: z.string().trim().min(3, "Say why, for your own record.").max(300),
});

export const overrideSubscriptionFn = createServerFn({ method: "POST" })
  .middleware(adminRateLimit)
  .inputValidator((data: unknown) => overrideSchema.parse(data))
  .handler(async ({ data, context }) => {
    await overrideSubscription(context.userId, context.tokens, data);
    return { ok: true };
  });
