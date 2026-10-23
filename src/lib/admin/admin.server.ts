// Platform-admin data access. The database-backed super_admin role is
// authoritative after the one-time owner bootstrap; PLATFORM_ADMIN_USER_ID
// is retained only as a compatibility path until then. The service-role RPC
// checks are never exposed to the browser, and every action below also
// requires an aal2 MFA session.
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadPlatformFx } from "@/lib/platform-fx-read.server";
import { savePlatformFx } from "@/lib/platform-fx.server";
import { AppError, dbFail, invalidateWorkspaceCacheForBusiness } from "@/lib/business.server";
import { getMfaStatus } from "@/lib/auth/mfa.server";
import type { SupabaseTokens } from "@/lib/auth/session.server";

// Thrown when the caller is the platform admin's user ID but hasn't
// completed an MFA challenge this session — distinct from "not admin at
// all" so the UI can show an MFA gate instead of a 404.
export class MfaRequiredError extends AppError {}

export type AdminStats = {
  businesses_total: number;
  businesses_by_status: Record<string, number>;
  businesses_by_plan: Record<string, number>;
  signups_last_30_days: number;
  payments_paid_total: number;
  payments_paid_count: number;
  payments_failed_count: number;
  payments_stuck_count: number;
};

export async function isPlatformAdmin(userId: string | undefined | null): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabaseAdmin.rpc("platform_admin_access", {
    _user_id: userId,
  });
  if (error) dbFail("check platform admin role", error);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new AppError("Could not verify platform administrator access.");
  }
  if (data["is_super_admin"] === true) return true;
  const bootstrapComplete = data["bootstrap_complete"] === true;
  const legacyAdminId = process.env["PLATFORM_ADMIN_USER_ID"];
  return !bootstrapComplete && Boolean(legacyAdminId) && userId === legacyAdminId;
}

// MFA is checked here, on every admin action, not just at the route's
// beforeLoad — beforeLoad only guards page navigation, not the underlying
// server functions, which are the actual security boundary.
export async function requireAdmin(userId: string, tokens: SupabaseTokens) {
  if (!(await isPlatformAdmin(userId))) {
    throw new AppError("Not found.");
  }
  const mfa = await getMfaStatus(tokens);
  if (mfa.currentLevel !== "aal2") {
    throw new MfaRequiredError("MFA verification required.");
  }
}

export async function listAdminSubscriptions(userId: string, tokens: SupabaseTokens) {
  await requireAdmin(userId, tokens);
  const { data, error } = await supabaseAdmin.rpc("admin_list_subscriptions");
  if (error) dbFail("load admin subscriptions", error);
  return data ?? [];
}

export async function listAdminPayments(userId: string, tokens: SupabaseTokens, limit = 50) {
  await requireAdmin(userId, tokens);
  const { data, error } = await supabaseAdmin.rpc("admin_list_payments", { _limit: limit });
  if (error) dbFail("load admin payments", error);
  return data ?? [];
}

export async function getAdminStats(userId: string, tokens: SupabaseTokens): Promise<AdminStats> {
  await requireAdmin(userId, tokens);
  const { data, error } = await supabaseAdmin.rpc("admin_platform_stats");
  if (error) dbFail("load admin stats", error);
  return data as unknown as AdminStats;
}

export async function overrideSubscription(
  userId: string,
  tokens: SupabaseTokens,
  input: {
    businessId: string;
    plan: Database["public"]["Enums"]["plan_tier"];
    status: Database["public"]["Enums"]["subscription_status"];
    currentPeriodEnd: string;
    reason: string;
  },
) {
  await requireAdmin(userId, tokens);
  const { error } = await supabaseAdmin.rpc("admin_override_subscription", {
    _business_id: input.businessId,
    _plan: input.plan,
    _status: input.status,
    _current_period_end: input.currentPeriodEnd,
    _reason: input.reason,
  });
  if (error) dbFail("override subscription", error);
  await invalidateWorkspaceCacheForBusiness(supabaseAdmin, input.businessId);
}

export async function getAdminPlatformFx(userId: string, tokens: SupabaseTokens) {
  await requireAdmin(userId, tokens);
  return loadPlatformFx();
}

export async function setAdminPlatformFx(
  userId: string,
  tokens: SupabaseTokens,
  input: { usdToZwg: number; source: string; effectiveOn: string; notice: string },
) {
  await requireAdmin(userId, tokens);
  await savePlatformFx(userId, input);
}
