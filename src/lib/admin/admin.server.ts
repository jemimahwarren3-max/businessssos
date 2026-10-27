// Platform-admin data access. The database-backed super_admin role is
// authoritative after the one-time owner bootstrap; PLATFORM_ADMIN_USER_ID
// is retained only as a compatibility path until then. The service-role RPC
// checks are never exposed to the browser, and every action below also
// requires an aal2 MFA session.
import type { Database, Json } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import { loadPlatformFx } from "@/lib/platform-fx-read.server";
import { savePlatformFx } from "@/lib/platform-fx.server";
import { AppError, dbFail, invalidateWorkspaceCacheForBusiness } from "@/lib/business.server";
import { getMfaStatus } from "@/lib/auth/mfa.server";
import type { SupabaseTokens } from "@/lib/auth/session.server";

// Thrown when the caller is the platform admin's user ID but hasn't
// completed an MFA challenge this session — distinct from "not admin at
// all" so the UI can show an MFA gate instead of a 404.
export class MfaRequiredError extends AppError {}

async function untypedRpc(
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: Json | null; error: { message?: string } | null }> {
  const rpc = supabaseAdmin.rpc as unknown as (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: Json | null; error: { message?: string } | null }>;
  return rpc(fn, args);
}

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

export type AdminBusinessRow = {
  id: string;
  name: string;
  created_at: string;
  plan: string | null;
  subscription_status: string | null;
  storefront_status: string | null;
  storefront_slug: string | null;
  member_count: number;
};

export type AdminStorefrontRow = {
  business_id: string;
  business_name: string;
  slug: string;
  status: string;
  store_name: string;
  template_id: string;
  published_at: string | null;
  listing_count: number;
  order_count: number;
};

export type AdminShopOrderRow = {
  id: string;
  reference: string;
  business_name: string;
  customer_name: string;
  total: number;
  currency: string;
  payment_status: string;
  fulfilment_status: string;
  created_at: string;
};

export type AdminAuditRow = {
  id: string;
  source: string;
  created_at: string;
  action: string;
  reason: string;
  business_id: string | null;
  detail: Record<string, string | number | boolean | null> | null;
};

export type AdminRuntime = {
  billing_enforced: boolean;
  updated_at: string;
  public_announcement: string;
  announcement_enabled: boolean;
};

async function logPlatformAudit(
  actorUserId: string,
  action: string,
  reason: string,
  detail: Record<string, unknown>,
) {
  const { error } = await (
    supabaseAdmin as unknown as {
      from: (table: string) => {
        insert: (row: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
      };
    }
  )
    .from("platform_admin_audit")
    .insert({
      actor_user_id: actorUserId,
      action,
      reason,
      outcome: "success",
      detail: detail as Json,
    });
  if (error) dbFail("write platform admin audit", error);
}

export async function listAdminBusinesses(
  userId: string,
  tokens: SupabaseTokens,
  input: { limit?: number; search?: string },
) {
  await requireAdmin(userId, tokens);
  const result = await untypedRpc("admin_list_businesses", {
    _limit: input.limit ?? 100,
    _search: input.search?.trim() || null,
  });
  if (result.error) dbFail("load admin businesses", result.error);
  return z.array(z.record(z.string(), z.unknown())).parse(result.data ?? []) as AdminBusinessRow[];
}

export async function listAdminStorefronts(userId: string, tokens: SupabaseTokens, limit = 100) {
  await requireAdmin(userId, tokens);
  const result = await untypedRpc("admin_list_storefronts", { _limit: limit });
  if (result.error) dbFail("load admin storefronts", result.error);
  return z.array(z.record(z.string(), z.unknown())).parse(result.data ?? []) as AdminStorefrontRow[];
}

export async function listAdminShopOrders(userId: string, tokens: SupabaseTokens, limit = 100) {
  await requireAdmin(userId, tokens);
  const result = await untypedRpc("admin_list_shop_orders", { _limit: limit });
  if (result.error) dbFail("load admin shop orders", result.error);
  return z.array(z.record(z.string(), z.unknown())).parse(result.data ?? []) as AdminShopOrderRow[];
}

export async function listAdminPlatformAudit(userId: string, tokens: SupabaseTokens, limit = 100) {
  await requireAdmin(userId, tokens);
  const result = await untypedRpc("admin_list_platform_audit", { _limit: limit });
  if (result.error) dbFail("load admin audit", result.error);
  return (z.array(z.record(z.string(), z.unknown())).parse(result.data ?? []) as AdminAuditRow[]).map(
    (row) => ({
      ...row,
      detail:
        row.detail && typeof row.detail === "object" && !Array.isArray(row.detail)
          ? (row.detail as Record<string, string | number | boolean | null>)
          : null,
    }),
  );
}

export async function getAdminRuntime(userId: string, tokens: SupabaseTokens): Promise<AdminRuntime> {
  await requireAdmin(userId, tokens);
  const result = await untypedRpc("admin_get_runtime", {});
  if (result.error) dbFail("load platform runtime", result.error);
  return result.data as unknown as AdminRuntime;
}

export async function updateAdminRuntime(
  userId: string,
  tokens: SupabaseTokens,
  input: {
    billingEnforced?: boolean;
    announcementEnabled?: boolean;
    publicAnnouncement?: string;
    reason: string;
  },
) {
  await requireAdmin(userId, tokens);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.billingEnforced !== undefined) patch["billing_enforced"] = input.billingEnforced;
  if (input.announcementEnabled !== undefined) {
    patch["announcement_enabled"] = input.announcementEnabled;
  }
  if (input.publicAnnouncement !== undefined) {
    patch["public_announcement"] = input.publicAnnouncement.slice(0, 2000);
  }
  const { error } = await (
    supabaseAdmin as unknown as {
      from: (table: string) => {
        update: (row: Record<string, unknown>) => {
          eq: (col: string, val: number) => Promise<{ error: { message?: string } | null }>;
        };
      };
    }
  )
    .from("platform_runtime")
    .update(patch)
    .eq("id", 1);
  if (error) dbFail("update platform runtime", error);
  await logPlatformAudit(userId, "update_platform_runtime", input.reason, patch);
}

export async function loadPlatformAnnouncement(): Promise<{ enabled: boolean; message: string }> {
  const result = await untypedRpc("get_platform_announcement", {});
  if (result.error) dbFail("load platform announcement", result.error);
  const data = result.data;
  const row = data as { enabled?: boolean; message?: string } | null;
  return {
    enabled: row?.enabled === true,
    message: typeof row?.message === "string" ? row.message : "",
  };
}
