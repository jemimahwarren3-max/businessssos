import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { allowAal1Session } from "@/integrations/supabase/auth-middleware";
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
  flushAdminOutbox,
  getAdminBusinessDetail,
  getAdminHealth,
  getAdminOutboxStats,
  getAdminRuntime,
  getAdminStats,
  getAdminPlatformFx,
  isPlatformAdmin,
  listAdminBusinesses,
  listAdminOutbox,
  listAdminPayments,
  listAdminPlatformAudit,
  listAdminShopOrders,
  listAdminStorefronts,
  listAdminSubscriptions,
  listPaymentProviderControls,
  loadPlatformAnnouncement,
  loadPublicMarketingCopy,
  overrideSubscription,
  setAdminPlatformFx,
  setPaymentProviderControl,
  updateAdminRuntime,
} from "./admin.server";

// authedRateLimit already composes requireSupabaseAuth internally and
// re-passes its context, so context.userId/context.tokens stay available
// with no other changes needed at each call site below.
const adminRateLimit = [
  authedRateLimit({ keyPrefix: "admin-api", maxRequests: 30, windowSeconds: 60 }),
] as const;

const adminStatusLimit = [
  allowAal1Session,
  authedRateLimit({ keyPrefix: "admin-status", maxRequests: 30, windowSeconds: 60 }),
] as const;

// Tighter — these three accept a 6-digit TOTP code, exactly the kind of
// code-guessing surface that normally gets a tight attempt throttle.
const adminMfaRateLimit = [
  allowAal1Session,
  authedRateLimit({ keyPrefix: "admin-mfa", maxRequests: 8, windowSeconds: 60 }),
] as const;

// Boolean-plus-MFA-status check, never throws — used by the /admin route's
// beforeLoad to decide whether to render a real 404 (not admin), an MFA
// gate (admin but not yet aal2 this session), or the real dashboard.
export const checkPlatformAdmin = createServerFn({ method: "GET" })
  .middleware(adminStatusLimit)
  .handler(async ({ context }) => {
    const isAdmin = await isPlatformAdmin(context.userId);
    if (!isAdmin) return { isAdmin: false as const };
    const mfa = await getMfaStatus(context.tokens);
    return { isAdmin: true as const, ...mfa };
  });

export const enrollAdminMfaFn = createServerFn({ method: "POST" })
  .middleware(adminRateLimit)
  .handler(async ({ context }) => {
    if (!(await isPlatformAdmin(context.userId))) throw new Error("Not found.");
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
    if (!(await isPlatformAdmin(context.userId))) throw new Error("Not found.");
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
    if (!(await isPlatformAdmin(context.userId))) throw new Error("Not found.");
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
    if (!(await isPlatformAdmin(context.userId))) throw new Error("Not found.");
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

const businessSearchSchema = z.object({
  search: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const getAdminBusinessesFn = createServerFn({ method: "POST" })
  .middleware(adminRateLimit)
  .inputValidator((data: unknown) => businessSearchSchema.parse(data ?? {}))
  .handler(async ({ data, context }) =>
    listAdminBusinesses(context.userId, context.tokens, {
      ...(data.search ? { search: data.search } : {}),
      ...(data.limit !== undefined ? { limit: data.limit } : {}),
    }),
  );

export const getAdminStorefrontsFn = createServerFn({ method: "GET" })
  .middleware(adminRateLimit)
  .handler(async ({ context }) => listAdminStorefronts(context.userId, context.tokens));

export const getAdminShopOrdersFn = createServerFn({ method: "GET" })
  .middleware(adminRateLimit)
  .handler(async ({ context }) => listAdminShopOrders(context.userId, context.tokens));

export const getAdminAuditFn = createServerFn({ method: "GET" })
  .middleware(adminRateLimit)
  .handler(async ({ context }) => listAdminPlatformAudit(context.userId, context.tokens));

export const getAdminRuntimeFn = createServerFn({ method: "GET" })
  .middleware(adminRateLimit)
  .handler(async ({ context }) => getAdminRuntime(context.userId, context.tokens));

const runtimeSchema = z.object({
  billingEnforced: z.boolean().optional(),
  announcementEnabled: z.boolean().optional(),
  publicAnnouncement: z.string().max(2000).optional(),
  marketingHeroTitle: z.string().max(500).optional(),
  marketingHeroSubtitle: z.string().max(800).optional(),
  reason: z.string().trim().min(3).max(300),
});

export const updateAdminRuntimeFn = createServerFn({ method: "POST" })
  .middleware(adminRateLimit)
  .inputValidator((data: unknown) => runtimeSchema.parse(data))
  .handler(async ({ data, context }) => {
    await updateAdminRuntime(context.userId, context.tokens, {
      reason: data.reason,
      ...(data.billingEnforced !== undefined ? { billingEnforced: data.billingEnforced } : {}),
      ...(data.announcementEnabled !== undefined
        ? { announcementEnabled: data.announcementEnabled }
        : {}),
      ...(data.publicAnnouncement !== undefined
        ? { publicAnnouncement: data.publicAnnouncement }
        : {}),
      ...(data.marketingHeroTitle !== undefined
        ? { marketingHeroTitle: data.marketingHeroTitle }
        : {}),
      ...(data.marketingHeroSubtitle !== undefined
        ? { marketingHeroSubtitle: data.marketingHeroSubtitle }
        : {}),
    });
    return { ok: true };
  });

const businessIdSchema = z.object({ businessId: z.string().uuid() });

export const getAdminBusinessDetailFn = createServerFn({ method: "POST" })
  .middleware(adminRateLimit)
  .inputValidator((data: unknown) => businessIdSchema.parse(data))
  .handler(async ({ data, context }) =>
    getAdminBusinessDetail(context.userId, context.tokens, data.businessId),
  );

export const getAdminCommunicationsFn = createServerFn({ method: "GET" })
  .middleware(adminRateLimit)
  .handler(async ({ context }) => {
    const [stats, rows] = await Promise.all([
      getAdminOutboxStats(context.userId, context.tokens),
      listAdminOutbox(context.userId, context.tokens, { limit: 50 }),
    ]);
    return { stats, rows };
  });

export const flushAdminOutboxFn = createServerFn({ method: "POST" })
  .middleware(adminRateLimit)
  .inputValidator((data: unknown) =>
    z.object({ reason: z.string().trim().min(3).max(300) }).parse(data),
  )
  .handler(async ({ data, context }) =>
    flushAdminOutbox(context.userId, context.tokens, data.reason),
  );

export const getAdminIntegrationsFn = createServerFn({ method: "GET" })
  .middleware(adminRateLimit)
  .handler(async ({ context }) => listPaymentProviderControls(context.userId, context.tokens));

const paynowControlSchema = z.object({
  enabled: z.boolean(),
  liveApproved: z.boolean(),
  approvalReference: z.string().max(200),
  reason: z.string().trim().min(3).max(300),
});

export const setPaynowControlFn = createServerFn({ method: "POST" })
  .middleware(adminRateLimit)
  .inputValidator((data: unknown) => paynowControlSchema.parse(data))
  .handler(async ({ data, context }) =>
    setPaymentProviderControl(context.userId, context.tokens, {
      provider: "paynow",
      enabled: data.enabled,
      liveApproved: data.liveApproved,
      approvalReference: data.approvalReference,
      reason: data.reason,
    }),
  );

export const getAdminHealthFn = createServerFn({ method: "GET" })
  .middleware(adminRateLimit)
  .handler(async ({ context }) => getAdminHealth(context.userId, context.tokens));

/** Merchant app banner — no admin required. */
export const getPlatformAnnouncementFn = createServerFn({ method: "GET" }).handler(async () =>
  loadPlatformAnnouncement(),
);

export const getPublicMarketingCopyFn = createServerFn({ method: "GET" }).handler(async () =>
  loadPublicMarketingCopy(),
);
