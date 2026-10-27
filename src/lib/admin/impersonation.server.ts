import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dbFail, invalidateWorkspaceCacheForBusiness, type Workspace } from "@/lib/business.server";
import { cacheDel, workspaceCacheKey } from "@/lib/cache/redis.server";
import {
  canOperateWithPlatformEntitlement,
  canWriteWithPlatformEntitlement,
} from "@/lib/billing-write";
import { isBillingEnabled } from "@/lib/feature-flags.server";
import type { Db } from "@/lib/business.server";
import { logPlatformAudit, requireAdmin } from "@/lib/admin/admin.server";
import type { SupabaseTokens } from "@/lib/auth/session.server";

export type ActiveImpersonation = {
  sessionId: string;
  businessId: string;
  businessName: string;
  reason: string;
  expiresAt: string;
};

async function untypedRpc(
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: { message?: string } | null }> {
  const rpc = supabaseAdmin.rpc as unknown as (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  return rpc(fn, args);
}

export async function getActiveImpersonation(
  adminUserId: string,
): Promise<ActiveImpersonation | null> {
  const result = await untypedRpc("admin_get_active_impersonation", {
    _admin_user_id: adminUserId,
  });
  if (result.error) dbFail("load impersonation session", result.error);
  const row = result.data as Record<string, unknown> | null;
  if (!row || typeof row["businessId"] !== "string") return null;
  return {
    sessionId: String(row["sessionId"]),
    businessId: row["businessId"],
    businessName: String(row["businessName"] ?? ""),
    reason: String(row["reason"] ?? ""),
    expiresAt: String(row["expiresAt"] ?? ""),
  };
}

export async function startPlatformImpersonation(
  adminUserId: string,
  tokens: SupabaseTokens,
  input: { businessId: string; reason: string; ttlMinutes?: number },
): Promise<ActiveImpersonation> {
  await requireAdmin(adminUserId, tokens);
  const result = await untypedRpc("admin_start_impersonation", {
    _admin_user_id: adminUserId,
    _business_id: input.businessId,
    _reason: input.reason,
    _ttl_minutes: input.ttlMinutes ?? 60,
  });
  if (result.error) dbFail("start impersonation", result.error);
  await logPlatformAudit(adminUserId, "start_impersonation", input.reason, {
    businessId: input.businessId,
    sessionId: result.data,
  });
  await invalidateWorkspaceCacheForBusiness(supabaseAdmin, input.businessId);
  await cacheDel(workspaceCacheKey(adminUserId));
  const active = await getActiveImpersonation(adminUserId);
  if (!active) {
    throw new Error("Impersonation session could not be started.");
  }
  return active;
}

export async function endPlatformImpersonation(
  adminUserId: string,
  tokens: SupabaseTokens,
  reason: string,
): Promise<void> {
  await requireAdmin(adminUserId, tokens);
  const before = await getActiveImpersonation(adminUserId);
  const result = await untypedRpc("admin_end_impersonation", { _admin_user_id: adminUserId });
  if (result.error) dbFail("end impersonation", result.error);
  await logPlatformAudit(adminUserId, "end_impersonation", reason, {
    endedCount: result.data,
    businessId: before?.businessId ?? null,
  });
  if (before?.businessId) {
    await invalidateWorkspaceCacheForBusiness(supabaseAdmin, before.businessId);
  }
  await cacheDel(workspaceCacheKey(adminUserId));
}

export async function loadWorkspaceWhileImpersonating(
  supabase: Db,
  adminUserId: string,
  businessId: string,
): Promise<Workspace | null> {
  const active = await getActiveImpersonation(adminUserId);
  if (!active || active.businessId !== businessId) return null;

  const [
    { data: business, error: bizError },
    { data: subscription },
    { data: permissions },
    featureFlagsResult,
  ] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, name, business_type, currency, onboarding_completed, logo_url")
      .eq("id", businessId)
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select("plan, status, trial_ends_at")
      .eq("business_id", businessId)
      .maybeSingle(),
    supabase.rpc("get_my_permissions", { _business_id: businessId }),
    untypedRpc("get_business_feature_flags", { _business_id: businessId }),
  ]);
  if (bizError) dbFail("load impersonated business", bizError);
  if (!business) return null;

  const flagPayload = featureFlagsResult.data;
  const billingExempt =
    flagPayload &&
    typeof flagPayload === "object" &&
    (flagPayload as { billingExempt?: boolean }).billingExempt === true;

  const entitlementBypass = billingExempt === true;

  return {
    business,
    role: "owner",
    permissions: permissions ?? [],
    plan: subscription?.plan ?? "free",
    planStatus: subscription?.status ?? "trialing",
    isReadOnly: true,
    isOperateLocked: !canOperateWithPlatformEntitlement(subscription ?? null, entitlementBypass),
    isPlatformOwner: false,
    billingEnabled: isBillingEnabled(),
    isImpersonating: true,
    impersonationExpiresAt: active.expiresAt,
    impersonationBusinessName: active.businessName,
  };
}

export async function assertNotImpersonating(supabase: Db, businessId: string) {
  const { data, error } = await supabase.rpc(
    "is_platform_impersonating" as never,
    {
      _business_id: businessId,
    } as never,
  );
  if (error) dbFail("impersonation check", error);
  if (data) {
    throw new Error(
      "Support view is read-only. End impersonation in the admin console to make changes.",
    );
  }
}
