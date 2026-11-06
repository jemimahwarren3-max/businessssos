import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  dbFail,
  invalidateWorkspaceCacheForBusiness,
  isMissingDbFunction,
  loadBusinessWorkspaceRow,
  type Workspace,
} from "@/lib/business.server";
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
  const client = supabaseAdmin as unknown as {
    rpc: (
      name: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };
  return client.rpc(fn, args);
}

export async function getActiveImpersonation(
  adminUserId: string,
): Promise<ActiveImpersonation | null> {
  const result = await untypedRpc("admin_get_active_impersonation", {
    _admin_user_id: adminUserId,
  });
  if (result.error) {
    if (isMissingDbFunction(result.error)) {
      console.error("[businessos] impersonation lookup skipped (function missing)", result.error);
      return null;
    }
    dbFail("load impersonation session", result.error);
  }
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
  if (result.error) {
    if (/not approved support access/i.test(result.error.message ?? "")) {
      throw new Error("The merchant has not approved support access for this shop yet.");
    }
    dbFail("start impersonation", result.error);
  }
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
    { data: permissions, error: permissionError },
    featureFlagsResult,
  ] = await Promise.all([
    loadBusinessWorkspaceRow(supabase, businessId),
    supabase
      .from("subscriptions")
      .select("plan, status, trial_ends_at")
      .eq("business_id", businessId)
      .maybeSingle(),
    supabase.rpc("get_my_permissions", { _business_id: businessId }),
    untypedRpc("get_business_feature_flags", { _business_id: businessId }),
  ]);
  if (bizError) dbFail("load impersonated business", bizError);
  if (permissionError) dbFail("load impersonated permissions", permissionError);
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
    permissions: Array.isArray(permissions) ? permissions : [],
    plan: subscription?.plan ?? "free",
    planStatus: subscription?.status ?? "trialing",
    isReadOnly: !canWriteWithPlatformEntitlement(subscription ?? null, entitlementBypass),
    isOperateLocked: !canOperateWithPlatformEntitlement(subscription ?? null, entitlementBypass),
    isPlatformOwner: false,
    billingEnabled: isBillingEnabled(),
    isImpersonating: true,
    impersonationExpiresAt: active.expiresAt,
    impersonationBusinessName: active.businessName,
  };
}

export type PlatformAccessStatus = {
  status: "none" | "pending" | "approved" | "declined" | "ended" | "expired";
  requestId?: string;
  expiresAt?: string;
  decidedAt?: string;
};

export async function requestPlatformAccess(
  adminUserId: string,
  tokens: SupabaseTokens,
  input: { businessId: string; reason: string },
): Promise<PlatformAccessStatus> {
  await requireAdmin(adminUserId, tokens);
  const result = await untypedRpc("admin_request_business_access", {
    _admin_user_id: adminUserId,
    _business_id: input.businessId,
    _reason: input.reason,
  });
  if (result.error) dbFail("request support access", result.error);
  await logPlatformAudit(adminUserId, "request_support_access", input.reason, {
    businessId: input.businessId,
  });
  return getPlatformAccessStatus(adminUserId, tokens, input.businessId);
}

export async function getPlatformAccessStatus(
  adminUserId: string,
  tokens: SupabaseTokens,
  businessId: string,
): Promise<PlatformAccessStatus> {
  await requireAdmin(adminUserId, tokens);
  const result = await untypedRpc("admin_get_business_access", {
    _admin_user_id: adminUserId,
    _business_id: businessId,
  });
  if (result.error) dbFail("load support access", result.error);
  const row = (result.data ?? {}) as Record<string, unknown>;
  return {
    status: (row["status"] as PlatformAccessStatus["status"]) ?? "none",
    ...(typeof row["requestId"] === "string" ? { requestId: row["requestId"] } : {}),
    ...(typeof row["expiresAt"] === "string" ? { expiresAt: row["expiresAt"] } : {}),
    ...(typeof row["decidedAt"] === "string" ? { decidedAt: row["decidedAt"] } : {}),
  };
}
