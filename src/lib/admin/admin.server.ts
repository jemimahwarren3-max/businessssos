// Platform-admin data access — see the migration's header comment
// (20260808200000_platform_admin.sql / 20260808210000_fix_grant_leaks.sql)
// for the full authorization model. Short version: PLATFORM_ADMIN_USER_ID
// is an env var, never a grantable role; every function here is checked
// against it before touching supabaseAdmin, and the underlying Postgres
// functions are independently locked to service_role only via GRANT/REVOKE
// (not an internal current_user check — see 20260808220000_fix_broken_secdef_check.sql
// for why that pattern is unsound) so this app-layer check is defense in
// depth, not the only gate.
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
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

export function isPlatformAdmin(userId: string | undefined | null): boolean {
  const adminId = process.env["PLATFORM_ADMIN_USER_ID"];
  return Boolean(adminId) && userId === adminId;
}

// MFA is checked here, on every admin action, not just at the route's
// beforeLoad — beforeLoad only guards page navigation, not the underlying
// server functions, which are the actual security boundary.
export async function requireAdmin(userId: string, tokens: SupabaseTokens) {
  if (!isPlatformAdmin(userId)) {
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
