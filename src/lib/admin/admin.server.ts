// Platform-admin data access. The database-backed super_admin role is
// authoritative after the one-time owner bootstrap; PLATFORM_ADMIN_USER_ID
// is retained only as a compatibility path until then. The service-role RPC
// checks are never exposed to the browser, and every action below also
// requires an aal2 MFA session.
import type { Database, Json } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import { paynowCredentialsConfigured } from "@/lib/payments/paynow-credentials.server";
import { loadPlatformFx } from "@/lib/platform-fx-read.server";
import { savePlatformFx } from "@/lib/platform-fx.server";
import {
  flushNotificationOutboxAdmin,
  notificationEmailStatus,
} from "@/lib/notifications.mail.server";
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
  marketing_hero_title: string;
  marketing_hero_subtitle: string;
  courier_ops_notes: string;
  sms_ops_notes: string;
};

export type BusinessFeatureFlags = {
  businessId: string;
  billingExempt: boolean;
  onlineShopEnabled: boolean;
  smsNotifications: boolean;
  courierManualMode: boolean;
  notes: string;
};

export type AdminBusinessDetail = {
  business: {
    id: string;
    name: string;
    created_at: string;
    currency: string;
    business_type: string;
  };
  subscription: {
    plan: string;
    status: string;
    trial_ends_at: string | null;
    current_period_end: string | null;
  } | null;
  storefront: {
    slug: string;
    status: string;
    store_name: string;
    template_id: string;
    published_at: string | null;
  } | null;
  counts: {
    products: number;
    store_orders: number;
    sales: number;
    members: number;
  };
  members: {
    user_id: string;
    role: string;
    email: string | null;
    notify_email: boolean;
  }[];
  recent_orders: {
    id: string;
    reference: string;
    customer_name: string;
    total: number;
    currency: string;
    payment_status: string;
    fulfilment_status: string;
    created_at: string;
  }[];
};

export type AdminOutboxRow = {
  id: string;
  business_name: string;
  to_email: string;
  subject: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
};

export type PaymentProviderControl = {
  provider: string;
  enabled: boolean;
  live_approved: boolean;
  approval_reference: string | null;
  updated_at: string;
};

export type AdminHealth = {
  appUrlSet: boolean;
  billingEnabledEnv: boolean;
  resend: { configured: boolean; reason: string };
  paynowUsd: boolean;
  paynowZig: boolean;
  mailFlushSecretSet: boolean;
  redisConfigured: boolean;
  aiDisabled: boolean;
  groqConfigured: boolean;
  geminiConfigured: boolean;
};

export async function logPlatformAudit(
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
  return z
    .array(z.record(z.string(), z.unknown()))
    .parse(result.data ?? []) as AdminStorefrontRow[];
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
  return (
    z.array(z.record(z.string(), z.unknown())).parse(result.data ?? []) as AdminAuditRow[]
  ).map((row) => ({
    ...row,
    detail:
      row.detail && typeof row.detail === "object" && !Array.isArray(row.detail)
        ? (row.detail as Record<string, string | number | boolean | null>)
        : null,
  }));
}

export async function getAdminRuntime(
  userId: string,
  tokens: SupabaseTokens,
): Promise<AdminRuntime> {
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
    marketingHeroTitle?: string;
    marketingHeroSubtitle?: string;
    courierOpsNotes?: string;
    smsOpsNotes?: string;
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
  if (input.marketingHeroTitle !== undefined) {
    patch["marketing_hero_title"] = input.marketingHeroTitle.slice(0, 500);
  }
  if (input.marketingHeroSubtitle !== undefined) {
    patch["marketing_hero_subtitle"] = input.marketingHeroSubtitle.slice(0, 800);
  }
  if (input.courierOpsNotes !== undefined) {
    patch["courier_ops_notes"] = input.courierOpsNotes.slice(0, 8000);
  }
  if (input.smsOpsNotes !== undefined) {
    patch["sms_ops_notes"] = input.smsOpsNotes.slice(0, 8000);
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

export async function loadPublicMarketingCopy(): Promise<{
  heroTitle: string | null;
  heroSubtitle: string | null;
}> {
  const result = await untypedRpc("get_public_marketing_copy", {});
  if (result.error) dbFail("load public marketing copy", result.error);
  const row = result.data as { heroTitle?: string | null; heroSubtitle?: string | null } | null;
  return {
    heroTitle: row?.heroTitle ?? null,
    heroSubtitle: row?.heroSubtitle ?? null,
  };
}

export async function getAdminBusinessDetail(
  userId: string,
  tokens: SupabaseTokens,
  businessId: string,
): Promise<AdminBusinessDetail | null> {
  await requireAdmin(userId, tokens);
  const result = await untypedRpc("admin_get_business_detail", { _business_id: businessId });
  if (result.error) dbFail("load business detail", result.error);
  if (!result.data) return null;
  return result.data as unknown as AdminBusinessDetail;
}

export type AdminOutboxStats = {
  pending: number;
  sending: number;
  failed: number;
  sent_24h: number;
  failed_24h: number;
};

export async function getAdminOutboxStats(
  userId: string,
  tokens: SupabaseTokens,
): Promise<AdminOutboxStats> {
  await requireAdmin(userId, tokens);
  const result = await untypedRpc("admin_notification_outbox_stats", {});
  if (result.error) dbFail("load outbox stats", result.error);
  const row = result.data as Record<string, number> | null;
  return {
    pending: row?.["pending"] ?? 0,
    sending: row?.["sending"] ?? 0,
    failed: row?.["failed"] ?? 0,
    sent_24h: row?.["sent_24h"] ?? 0,
    failed_24h: row?.["failed_24h"] ?? 0,
  };
}

export async function listAdminOutbox(
  userId: string,
  tokens: SupabaseTokens,
  input: { limit?: number; status?: string },
) {
  await requireAdmin(userId, tokens);
  const result = await untypedRpc("admin_list_notification_outbox", {
    _limit: input.limit ?? 50,
    _status: input.status ?? null,
  });
  if (result.error) dbFail("load notification outbox", result.error);
  return z.array(z.record(z.string(), z.unknown())).parse(result.data ?? []) as AdminOutboxRow[];
}

export async function flushAdminOutbox(userId: string, tokens: SupabaseTokens, reason: string) {
  await requireAdmin(userId, tokens);
  const result = await flushNotificationOutboxAdmin();
  await logPlatformAudit(userId, "flush_notification_outbox", reason, {
    sent: result.sent,
    failed: result.failed,
    skipped: result.skipped,
  });
  return result;
}

export async function listPaymentProviderControls(userId: string, tokens: SupabaseTokens) {
  await requireAdmin(userId, tokens);
  const result = await untypedRpc("admin_get_payment_provider_controls", {});
  if (result.error) dbFail("load payment provider controls", result.error);
  return z
    .array(z.record(z.string(), z.unknown()))
    .parse(result.data ?? []) as PaymentProviderControl[];
}

export async function setPaymentProviderControl(
  userId: string,
  tokens: SupabaseTokens,
  input: {
    provider: string;
    enabled: boolean;
    liveApproved: boolean;
    approvalReference: string;
    reason: string;
  },
) {
  await requireAdmin(userId, tokens);
  const result = await untypedRpc("admin_set_payment_provider_control", {
    _provider: input.provider,
    _enabled: input.enabled,
    _live_approved: input.liveApproved,
    _approval_reference: input.approvalReference,
  });
  if (result.error) dbFail("update payment provider control", result.error);
  await logPlatformAudit(userId, "set_payment_provider_control", input.reason, {
    provider: input.provider,
    enabled: input.enabled,
    liveApproved: input.liveApproved,
  });
  return result.data as PaymentProviderControl;
}

export async function getAdminHealth(userId: string, tokens: SupabaseTokens): Promise<AdminHealth> {
  await requireAdmin(userId, tokens);
  return {
    appUrlSet: Boolean(process.env["APP_URL"]?.trim()),
    billingEnabledEnv: process.env["BILLING_ENABLED"] === "true",
    resend: notificationEmailStatus(),
    paynowUsd: paynowCredentialsConfigured("USD"),
    paynowZig: paynowCredentialsConfigured("ZWG"),
    mailFlushSecretSet: Boolean(process.env["MAIL_FLUSH_SECRET"]?.trim()),
    redisConfigured: Boolean(
      process.env["UPSTASH_REDIS_REST_URL"]?.trim() &&
      process.env["UPSTASH_REDIS_REST_TOKEN"]?.trim(),
    ),
    aiDisabled:
      process.env["AI_DISABLED"]?.trim().toLowerCase() === "true" ||
      process.env["AI_PROVIDER"]?.trim().toLowerCase() === "off",
    groqConfigured: Boolean(process.env["GROQ_API_KEY"]?.trim()),
    geminiConfigured: Boolean(process.env["GEMINI_API_KEY"]?.trim()),
  };
}

export async function exportAdminTenantsCsv(
  userId: string,
  tokens: SupabaseTokens,
): Promise<string> {
  await requireAdmin(userId, tokens);
  const result = await untypedRpc("admin_export_tenants_csv", {});
  if (result.error) dbFail("export tenants csv", result.error);
  await logPlatformAudit(userId, "export_tenants_csv", "Operator CSV export", {});
  return typeof result.data === "string" ? result.data : "";
}

export async function getBusinessFeatureFlagsAdmin(
  userId: string,
  tokens: SupabaseTokens,
  businessId: string,
): Promise<BusinessFeatureFlags> {
  await requireAdmin(userId, tokens);
  const result = await untypedRpc("admin_get_business_feature_flags", { _business_id: businessId });
  if (result.error) dbFail("load business feature flags", result.error);
  const row = result.data as Record<string, unknown>;
  return {
    businessId,
    billingExempt: row["billingExempt"] === true,
    onlineShopEnabled: row["onlineShopEnabled"] !== false,
    smsNotifications: row["smsNotifications"] === true,
    courierManualMode: row["courierManualMode"] !== false,
    notes: typeof row["notes"] === "string" ? row["notes"] : "",
  };
}

export async function setBusinessFeatureFlagsAdmin(
  userId: string,
  tokens: SupabaseTokens,
  input: {
    businessId: string;
    billingExempt: boolean;
    onlineShopEnabled: boolean;
    smsNotifications: boolean;
    courierManualMode: boolean;
    notes: string;
    reason: string;
  },
) {
  await requireAdmin(userId, tokens);
  const result = await untypedRpc("admin_set_business_feature_flags", {
    _business_id: input.businessId,
    _billing_exempt: input.billingExempt,
    _online_shop_enabled: input.onlineShopEnabled,
    _sms_notifications: input.smsNotifications,
    _courier_manual_mode: input.courierManualMode,
    _notes: input.notes.slice(0, 2000),
  });
  if (result.error) dbFail("save business feature flags", result.error);
  await invalidateWorkspaceCacheForBusiness(supabaseAdmin, input.businessId);
  await logPlatformAudit(userId, "set_business_feature_flags", input.reason, {
    businessId: input.businessId,
    billingExempt: input.billingExempt,
    onlineShopEnabled: input.onlineShopEnabled,
  });
  return result.data as BusinessFeatureFlags;
}

export async function waiveStoreLaunchFeeAdmin(
  userId: string,
  tokens: SupabaseTokens,
  input: { businessId: string; reason: string },
) {
  await requireAdmin(userId, tokens);
  const result = await untypedRpc("admin_waive_store_launch_fee", {
    _business_id: input.businessId,
    _reason: input.reason.trim(),
    _actor_user_id: userId,
  });
  if (result.error) dbFail("waive store launch fee", result.error);
  await invalidateWorkspaceCacheForBusiness(supabaseAdmin, input.businessId);
  await logPlatformAudit(userId, "waive_store_launch_fee", input.reason, {
    businessId: input.businessId,
  });
}

export async function setStorefrontSuspendedAdmin(
  userId: string,
  tokens: SupabaseTokens,
  input: { businessId: string; suspended: boolean; reason: string },
) {
  await requireAdmin(userId, tokens);
  const result = await untypedRpc("admin_set_storefront_suspended", {
    _business_id: input.businessId,
    _suspended: input.suspended,
    _reason: input.reason.trim(),
    _actor_user_id: userId,
  });
  if (result.error) dbFail("set storefront suspended", result.error);
  await invalidateWorkspaceCacheForBusiness(supabaseAdmin, input.businessId);
  await logPlatformAudit(
    userId,
    input.suspended ? "suspend_storefront" : "restore_storefront",
    input.reason,
    { businessId: input.businessId },
  );
}

export async function listStorefrontLaunchPaymentsAdmin(
  userId: string,
  tokens: SupabaseTokens,
  businessId: string,
) {
  await requireAdmin(userId, tokens);
  const result = await untypedRpc("admin_list_storefront_launch_payments", {
    _business_id: businessId,
    _limit: 20,
  });
  if (result.error) dbFail("list storefront launch payments", result.error);
  return result.data ?? [];
}

export async function updateAdminOpsNotes(
  userId: string,
  tokens: SupabaseTokens,
  input: { courierNotes?: string; smsNotes?: string; reason: string },
) {
  await requireAdmin(userId, tokens);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.courierNotes !== undefined) {
    patch["courier_ops_notes"] = input.courierNotes.slice(0, 8000);
  }
  if (input.smsNotes !== undefined) {
    patch["sms_ops_notes"] = input.smsNotes.slice(0, 8000);
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
  if (error) dbFail("update ops notes", error);
  await logPlatformAudit(userId, "update_ops_notes", input.reason, patch);
}
