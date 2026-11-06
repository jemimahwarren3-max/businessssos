import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { cacheDel, cacheGet, cacheSet, workspaceCacheKey } from "@/lib/cache/redis.server";
import {
  canOperateWithPlatformEntitlement,
  canWriteForSubscription,
  canWriteWithPlatformEntitlement,
} from "@/lib/billing-write";
import { isBillingEnabled } from "@/lib/feature-flags.server";
import { paynowCredentialsConfigured } from "@/lib/payments/paynow-credentials.server";
import { flushNotificationOutboxForBusiness } from "@/lib/notifications.mail.server";
import type {
  ConvertQuoteInput,
  CreateBusinessInput,
  ApplyDepositInput,
  CollectLaybyInput,
  CreateLaybyInput,
  CreditPaymentInput,
  CustomerDepositInput,
  CustomerImportRow,
  CustomerInput,
  LaybyInstalmentInput,
  ExpenseImportRow,
  ExpenseInput,
  InvoiceInput,
  InvoiceStatusInput,
  LineItemInput,
  PaymentInput,
  ProductImportRow,
  ProductInput,
  PurchaseOrderInput,
  PurchaseOrderStatusInput,
  QuoteInput,
  QuoteStatusInput,
  RecurringInvoiceInput,
  RefundSaleInput,
  SaleHistoryImportRow,
  SaleInput,
  SaleLineImportRow,
  StockAdjustInput,
  SupplierInput,
  SupplierPaymentInput,
  UpdateSupplierInput,
} from "./business.schemas";

export { canWriteForSubscription };

export type Db = SupabaseClient<Database>;

/** Friendly errors only, never leak Postgres details to the browser. */
export class AppError extends Error {}

function fail(message: string): never {
  throw new AppError(message);
}

const USER_FACING_DB =
  /already taken|already exists|already belong|signed in|choose another|choose one of the store|does not allow|not allowed|cover image must|theme colors must|supported font|store theme settings|store content must|enter a shop name|cash drawer|not enough stock|outstanding|payment amount|select a customer|you do not have permission|not a member of this business|that customer|a sale needs|discount cannot|item quantity|recognised payment|does not owe|cannot itself be on credit|could not be found|tender amounts must add up|each tender|split across|use each payment method|3-letter currency|original amount|does not convert|supplier|deposit|lay-by|collect-after|held deposit|not ready to collect|already paid in full/i;

function firstUserFacingLine(message: string): string {
  return message.replace(/^ERROR:\s*/i, "").split("\n")[0] ?? message;
}

/** Missing RPC / stale PostgREST cache, not a form-validation failure. */
export const SCHEMA_DRIFT_USER_MESSAGE =
  "The shop server is still updating, this is not a problem with your form. Wait a minute and try again. Do not create a second shop.";

export function userFacingDbMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message?.trim() ?? "";
  if (code === "23505") return "That value already exists. Please use a different one.";
  if (code === "42501") return "You don't have permission to do that.";
  // B0001/B0002 are our own RPC errors. PostgREST often remaps them to P0001.
  if (
    (code === "B0001" || code === "B0002" || code === "P0001") &&
    message &&
    USER_FACING_DB.test(message)
  ) {
    return firstUserFacingLine(message);
  }
  if (message && USER_FACING_DB.test(message)) {
    return firstUserFacingLine(message);
  }
  if (isMissingDbFunction(error)) {
    return SCHEMA_DRIFT_USER_MESSAGE;
  }
  return "Something went wrong saving your data. Please try again.";
}

/** Optional RPCs (feature flags, impersonation, platform bypass) may be
 * missing on a staging database that has not applied every migration.
 * Treat those as "function not installed" rather than wiping the workspace. */
export function isMissingDbFunction(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message ?? "";
  return (
    code === "42883" ||
    code === "PGRST202" ||
    /schema cache|could not find the function/i.test(message)
  );
}

/** Staging/production may not have applied the latest ALTER TABLE yet. */
export function isMissingDbColumn(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message ?? "";
  return (
    code === "42703" ||
    code === "PGRST204" ||
    /column .* does not exist/i.test(message) ||
    /could not find the .* column/i.test(message)
  );
}

const BUSINESS_WORKSPACE_COLUMNS =
  "id, name, business_type, currency, onboarding_completed, logo_url, business_path, setup_completed_at";

export async function loadBusinessWorkspaceRow(supabase: Db, businessId: string) {
  const withModel = await supabase
    .from("businesses")
    .select(`${BUSINESS_WORKSPACE_COLUMNS}, commerce_model`)
    .eq("id", businessId)
    .maybeSingle();
  if (!withModel.error || !isMissingDbColumn(withModel.error)) return withModel;
  console.error(
    "[businessos] commerce_model column missing, loading workspace without it",
    withModel.error,
  );
  return supabase
    .from("businesses")
    .select(BUSINESS_WORKSPACE_COLUMNS)
    .eq("id", businessId)
    .maybeSingle();
}

function skipMissingRpc(context: string, error: unknown): boolean {
  if (!error) return true;
  if (!isMissingDbFunction(error)) return false;
  console.error(`[businessos] ${context} skipped (function missing)`, error);
  return true;
}

export function dbFail(context: string, error: unknown): never {
  console.error(`[businessos] ${context}`, error);
  fail(userFacingDbMessage(error));
}

export type Workspace = {
  business: {
    id: string;
    name: string;
    business_type: string;
    currency: string;
    onboarding_completed: boolean;
    logo_url: string | null;
    business_path: string;
    setup_completed_at: string | null;
    commerce_model?: string;
  };
  role: string;
  permissions: string[];
  plan: string;
  planStatus: string;
  isReadOnly: boolean;
  /** True when billing is on but subscription is not paid `active` (e.g. trialing setup). */
  isOperateLocked: boolean;
  isPlatformOwner: boolean;
  billingEnabled: boolean;
  /** Platform admin support view, merchant data is read-only. */
  isImpersonating?: boolean;
  impersonationExpiresAt?: string;
  impersonationBusinessName?: string;
  featureFlags?: {
    billingExempt: boolean;
    onlineShopEnabled: boolean;
    smsNotifications: boolean;
    courierManualMode: boolean;
  };
};

/** Server-side authorization: confirm the caller belongs to the business. */
export async function assertMember(supabase: Db, businessId: string) {
  const { data, error } = await supabase.rpc("is_business_member", {
    _business_id: businessId,
  });
  if (error) dbFail("membership check", error);
  if (!data) fail("You don't have access to this business.");
}

export async function assertRole(supabase: Db, businessId: string, roles: string[]) {
  const { data, error } = await supabase.rpc("has_business_role", {
    _business_id: businessId,
    _roles: roles as never,
  });
  if (error) dbFail("role check", error);
  if (!data) fail("Your role doesn't allow this action.");
}

/** The data-driven successor to assertRole, checks a permission key against
 * business_role_permissions (owner always passes) instead of a hardcoded
 * role array. RLS policies and RPC-embedded has_business_role checks
 * throughout the schema are a separate, lower-level layer this doesn't
 * replace, only application-layer call sites use this. */
export async function assertPermission(supabase: Db, businessId: string, permission: string) {
  const { data, error } = await supabase.rpc("has_permission", {
    _business_id: businessId,
    _permission: permission,
  });
  if (error) dbFail("permission check", error);
  if (!data) fail("Your role doesn't allow this action.");
}

export async function assertAnyPermission(supabase: Db, businessId: string, permissions: string[]) {
  for (const permission of permissions) {
    const { data, error } = await supabase.rpc("has_permission", {
      _business_id: businessId,
      _permission: permission,
    });
    if (error) dbFail("permission check", error);
    if (data) return;
  }
  fail("Your role doesn't allow this action.");
}

const READ_ONLY_MESSAGE =
  "Your trial has ended. Upgrade to Pro to keep creating and editing, your existing data is still safe and visible.";

const OPERATE_MESSAGE =
  "Pay for Kwetuu Pro to publish your shop and use the sales counter. You can still finish setup, add draft products, and preview your store.";

async function loadSubscriptionEntitlement(supabase: Db, businessId: string) {
  const [
    { data: subscription, error },
    { data: hasOwnerBypass, error: entitlementError },
    { data: flagRow, error: flagError },
  ] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("status, trial_ends_at")
      .eq("business_id", businessId)
      .maybeSingle(),
    supabase.rpc("has_platform_subscription_bypass"),
    supabase.rpc("get_business_feature_flags" as never, { _business_id: businessId } as never),
  ]);
  if (error) dbFail("check subscription status", error);
  if (
    entitlementError &&
    !skipMissingRpc("check platform subscription entitlement", entitlementError)
  ) {
    dbFail("check platform subscription entitlement", entitlementError);
  }
  if (flagError && !skipMissingRpc("check business feature flags", flagError)) {
    dbFail("check business feature flags", flagError);
  }
  const billingExempt =
    flagRow &&
    typeof flagRow === "object" &&
    !Array.isArray(flagRow) &&
    (flagRow as { billingExempt?: boolean }).billingExempt === true;
  return {
    subscription,
    hasOwnerBypass: Boolean(hasOwnerBypass) || Boolean(billingExempt),
  };
}

/** Gate for setup writes (products, drafts, storefront design), trialing allowed. */
export async function assertCanWrite(supabase: Db, businessId: string) {
  const { subscription, hasOwnerBypass } = await loadSubscriptionEntitlement(supabase, businessId);
  if (!canWriteWithPlatformEntitlement(subscription, hasOwnerBypass)) fail(READ_ONLY_MESSAGE);
}

/** Gate for publish, POS, and cash drawer, requires paid `active` subscription. */
export async function assertCanOperate(supabase: Db, businessId: string) {
  const { subscription, hasOwnerBypass } = await loadSubscriptionEntitlement(supabase, businessId);
  if (!canOperateWithPlatformEntitlement(subscription, hasOwnerBypass)) fail(OPERATE_MESSAGE);
}

export async function assertCanPublish(supabase: Db, businessId: string) {
  await assertCanOperate(supabase, businessId);
}

export async function recordAudit(
  supabase: Db,
  input: {
    businessId: string;
    userId: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    summary?: string;
    oldValues?: unknown;
    newValues?: unknown;
  },
) {
  const { error } = await supabase.from("audit_logs").insert({
    business_id: input.businessId,
    user_id: input.userId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    summary: input.summary ?? null,
    old_values: (input.oldValues ?? null) as never,
    new_values: (input.newValues ?? null) as never,
  });
  if (error) console.error("[businessos] audit log failed", error);
}

// Hit on essentially every authenticated page load, so it's the one query
// in this app actually worth caching (see src/lib/cache/redis.server.ts,
// no-ops entirely if Upstash isn't configured, so this is safe to ship
// before you've set it up). Only the found-workspace case is cached, not
// "no workspace yet" (the mid-onboarding case), that's rare enough that
// re-checking it every time costs nothing, and caching a null would need
// extra bookkeeping to tell apart from a genuine cache miss.
export async function loadWorkspace(supabase: Db, userId: string): Promise<Workspace | null> {
  const cacheKey = workspaceCacheKey(userId);
  const cached = await cacheGet<Workspace>(cacheKey);
  if (cached) return cached;

  const { getActiveImpersonation, loadWorkspaceWhileImpersonating } =
    await import("@/lib/admin/impersonation.server");
  let impersonation: Awaited<ReturnType<typeof getActiveImpersonation>> = null;
  try {
    impersonation = await getActiveImpersonation(userId);
  } catch (error) {
    console.error("[businessos] impersonation lookup failed", error);
  }
  if (impersonation) {
    const workspace = await loadWorkspaceWhileImpersonating(
      supabase,
      userId,
      impersonation.businessId,
    );
    if (workspace) {
      await cacheSet(cacheKey, workspace, 60);
    }
    return workspace;
  }

  const { data: membership, error } = await supabase
    .from("business_members")
    .select("role, business_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) dbFail("load membership", error);
  if (!membership) return null;

  const [
    { data: business, error: bizError },
    { data: subscription },
    { data: permissions, error: permissionError },
    { data: hasOwnerBypass, error: entitlementError },
    { data: featureFlags, error: featureFlagError },
  ] = await Promise.all([
    loadBusinessWorkspaceRow(supabase, membership.business_id),
    supabase
      .from("subscriptions")
      .select("plan, status, trial_ends_at")
      .eq("business_id", membership.business_id)
      .maybeSingle(),
    // Every member's own effective permission set, owner gets everything,
    // everyone else gets exactly what business_role_permissions grants
    // their role, defaulted to today's behavior on first access.
    supabase.rpc("get_my_permissions", { _business_id: membership.business_id }),
    supabase.rpc("has_platform_subscription_bypass"),
    supabase.rpc(
      "get_business_feature_flags" as never,
      {
        _business_id: membership.business_id,
      } as never,
    ),
  ]);
  if (bizError) dbFail("load business", bizError);
  if (permissionError) dbFail("load permissions", permissionError);
  if (
    entitlementError &&
    !skipMissingRpc("check platform subscription entitlement", entitlementError)
  ) {
    dbFail("check platform subscription entitlement", entitlementError);
  }
  if (featureFlagError && !skipMissingRpc("load business feature flags", featureFlagError)) {
    dbFail("load business feature flags", featureFlagError);
  }
  if (!business) return null;

  const flags =
    featureFlags && typeof featureFlags === "object" && !Array.isArray(featureFlags)
      ? (featureFlags as Workspace["featureFlags"])
      : undefined;
  const billingExempt = flags?.billingExempt === true;

  const workspace: Workspace = {
    business: business as unknown as Workspace["business"],
    role: membership.role,
    permissions: Array.isArray(permissions) ? permissions : [],
    plan: subscription?.plan ?? "free",
    planStatus: subscription?.status ?? "trialing",
    isReadOnly: !canWriteWithPlatformEntitlement(
      subscription ?? null,
      Boolean(hasOwnerBypass) || billingExempt,
    ),
    isOperateLocked: !canOperateWithPlatformEntitlement(
      subscription ?? null,
      Boolean(hasOwnerBypass) || billingExempt,
    ),
    isPlatformOwner: Boolean(hasOwnerBypass),
    billingEnabled: isBillingEnabled(),
    ...(flags ? { featureFlags: flags } : {}),
  };
  await cacheSet(cacheKey, workspace, 60);
  return workspace;
}

/** Call after anything that changes a business's plan/status or a member's
 * role, every active member's cached workspace needs to reflect it, not
 * just whoever triggered the change. A 60s TTL bounds staleness even if a
 * future write path forgets this, but real writes shouldn't rely on that. */
export async function invalidateWorkspaceCacheForBusiness(
  supabase: Db,
  businessId: string,
): Promise<void> {
  const { data: members } = await supabase
    .from("business_members")
    .select("user_id")
    .eq("business_id", businessId)
    .eq("is_active", true);
  await Promise.all((members ?? []).map((m) => cacheDel(workspaceCacheKey(m.user_id))));
}

export async function createBusinessRecord(
  supabase: Db,
  userId: string,
  input: CreateBusinessInput,
) {
  // Do not call loadWorkspace here, that RPC-heavy path can fail on a missing
  // feature-flag function and block first-time create. Membership is enough.
  const { data: existingMember } = await supabase
    .from("business_members")
    .select("business_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingMember?.business_id) return existingMember.business_id;

  const { data: businessId, error } = await supabase.rpc("create_business_with_owner", {
    _name: input.name,
    _business_type: input.businessType,
    _currency: input.currency,
    _phone: input.phone ?? "",
    _address: input.address ?? "",
    _business_path: (input as { businessPath?: string }).businessPath ?? "management",
    _onboarding_config: ((input as { onboardingConfig?: Record<string, unknown> })
      .onboardingConfig ?? {}) as Json,
  });
  if (error) dbFail("create business", error);
  const businessIdStr =
    typeof businessId === "string"
      ? businessId
      : businessId &&
          typeof businessId === "object" &&
          "id" in businessId &&
          typeof (businessId as { id: unknown }).id === "string"
        ? (businessId as { id: string }).id
        : null;
  if (!businessIdStr) dbFail("create business", new Error("Unexpected create business response."));

  // Best-effort, the business itself is already fully committed above, so a
  // failure here shouldn't roll anything back or block the user.
  await supabase.from("notifications").insert({
    business_id: businessIdStr,
    user_id: userId,
    type: "welcome",
    title: "Welcome to Kwetuu",
    message: isBillingEnabled()
      ? "Your 1-month Pro trial has started. Add your first products to begin."
      : "You're in! Kwetuu is free during our beta, add your first products to begin.",
    severity: "info",
  });
  await recordAudit(supabase, {
    businessId: businessIdStr,
    userId,
    action: "business.created",
    entityType: "business",
    entityId: businessIdStr,
    summary: `Created business ${input.name}`,
  });

  return businessIdStr;
}

export async function markOnboardingComplete(supabase: Db, userId: string): Promise<void> {
  const workspace = await loadWorkspace(supabase, userId);
  if (!workspace || workspace.business.onboarding_completed) return;
  const { error } = await supabase
    .from("businesses")
    .update({ onboarding_completed: true })
    .eq("id", workspace.business.id);
  if (error) dbFail("complete onboarding", error);
  await cacheDel(workspaceCacheKey(userId));
}

export async function getSetupProgress(supabase: Db, businessId: string) {
  await assertMember(supabase, businessId);
  const { data, error } = await supabase.rpc("get_setup_progress", {
    _business_id: businessId,
  });
  if (error) dbFail("load setup progress", error);
  return data as unknown as {
    business_path: string;
    setup_completed_at: string | null;
    commerce_model?: string;
    has_products: boolean;
    has_services?: boolean;
    product_count: number;
    has_sales: boolean;
    sale_count: number;
    storefront_enabled: boolean;
    has_customers: boolean;
    has_team: boolean;
    onboarding_config: Record<string, string | number | boolean | null>;
  };
}

export async function saveOnboardingConfig(
  supabase: Db,
  businessId: string,
  config: Record<string, unknown>,
) {
  const { error } = await supabase.rpc("save_onboarding_config", {
    _business_id: businessId,
    _config: config as Json,
  });
  if (error) dbFail("save onboarding config", error);
}

export async function saveOnboardingSettings(
  supabase: Db,
  businessId: string,
  settings: {
    paymentMethods: string[];
    allowsCredit: boolean;
    allowsLayby: boolean;
    tracksStock: boolean;
    sellsServices: boolean;
    pricingModel: string;
    offersDelivery: boolean;
    offersCollection: boolean;
  },
) {
  const { error } = await supabase.rpc("save_onboarding_settings", {
    _business_id: businessId,
    _payment_methods: settings.paymentMethods,
    _allows_credit: settings.allowsCredit,
    _allows_layby: settings.allowsLayby,
    _tracks_stock: settings.tracksStock,
    _sells_services: settings.sellsServices,
    _pricing_model: settings.pricingModel,
    _offers_delivery: settings.offersDelivery,
    _offers_collection: settings.offersCollection,
  });
  if (error) dbFail("save onboarding settings", error);
}

export async function markSetupComplete(supabase: Db, businessId: string) {
  const { error } = await supabase.rpc("mark_setup_complete", {
    _business_id: businessId,
  });
  if (error) dbFail("mark setup complete", error);
}

/* -------------------------------- billing -------------------------------- */

export async function loadBillingSummary(supabase: Db, businessId: string) {
  const [{ data: subscription, error: subError }, { data: payments, error: payError }] =
    await Promise.all([
      supabase
        .from("subscriptions")
        .select("plan, status, interval, trial_ends_at, current_period_start, current_period_end")
        .eq("business_id", businessId)
        .maybeSingle(),
      supabase
        .from("subscription_payments")
        .select("reference, plan, interval, amount, currency, status, created_at, paid_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
  if (subError) dbFail("load subscription", subError);
  if (payError) dbFail("load subscription payments", payError);

  return {
    subscription: subscription ?? null,
    payments: payments ?? [],
    paynowUsdConfigured: paynowCredentialsConfigured("USD"),
    paynowZigConfigured: paynowCredentialsConfigured("ZWG"),
  };
}

/* ------------------------------ categories ------------------------------ */

export async function listCategories(supabase: Db, businessId: string) {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .eq("business_id", businessId)
    .order("name");
  if (error) dbFail("list categories", error);
  return data ?? [];
}

export async function createCategory(supabase: Db, businessId: string, name: string) {
  await assertCanWrite(supabase, businessId);
  const { data, error } = await supabase
    .from("categories")
    .insert({ business_id: businessId, name: name.trim() })
    .select("id, name")
    .single();
  if (error) dbFail("create category", error);
  return data!;
}

/* ----------------------------- location stock ----------------------------- */

export async function listLocationStock(supabase: Db, businessId: string, locationId: string) {
  const { data, error } = await supabase
    .from("product_stock")
    .select("product_id, quantity")
    .eq("business_id", businessId)
    .eq("location_id", locationId);
  if (error) dbFail("list location stock", error);
  return data ?? [];
}

/* ------------------------------- products ------------------------------- */

export async function listProducts(
  supabase: Db,
  businessId: string,
  search: string,
  supplierId?: string,
  limit = 100,
) {
  const term = search.trim().replace(/[,()]/g, "");
  let withWholesaleQuery = supabase
    .from("products")
    .select(
      "id, name, sku, barcode, unit, cost_price, selling_price, wholesale_price, stock, min_stock, tax_rate, is_active, updated_at, supplier_id, image_url, category_id",
    )
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (term) {
    withWholesaleQuery = withWholesaleQuery.or(
      `name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`,
    );
  }
  if (supplierId) withWholesaleQuery = withWholesaleQuery.eq("supplier_id", supplierId);
  const withWholesale = await withWholesaleQuery;
  if (!withWholesale.error || !isMissingDbColumn(withWholesale.error)) {
    if (withWholesale.error) dbFail("list products", withWholesale.error);
    return withWholesale.data ?? [];
  }
  console.error(
    "[businessos] wholesale_price column missing, listing products without it",
    withWholesale.error,
  );
  let withoutWholesaleQuery = supabase
    .from("products")
    .select(
      "id, name, sku, barcode, unit, cost_price, selling_price, stock, min_stock, tax_rate, is_active, updated_at, supplier_id, image_url, category_id",
    )
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (term) {
    withoutWholesaleQuery = withoutWholesaleQuery.or(
      `name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`,
    );
  }
  if (supplierId) withoutWholesaleQuery = withoutWholesaleQuery.eq("supplier_id", supplierId);
  const withoutWholesale = await withoutWholesaleQuery;
  if (withoutWholesale.error) dbFail("list products", withoutWholesale.error);
  return (withoutWholesale.data ?? []).map((row) => ({ ...row, wholesale_price: null }));
}

export async function listLocations(
  supabase: Db,
  businessId: string,
  options?: { includeInactive?: boolean },
) {
  let query = supabase
    .from("locations")
    .select("id, name, address, phone, is_active, is_default")
    .eq("business_id", businessId)
    .order("is_default", { ascending: false })
    .order("name");
  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }
  const { data, error } = await query;
  if (error) dbFail("list locations", error);
  return data ?? [];
}

export async function createLocation(
  supabase: Db,
  input: { businessId: string; name: string; address?: string; phone?: string },
) {
  await assertRole(supabase, input.businessId, ["owner", "admin"]);
  await assertCanWrite(supabase, input.businessId);
  const { data, error } = await supabase.rpc("create_location", {
    _business_id: input.businessId,
    _name: input.name,
    _address: input.address ?? "",
    _phone: input.phone ?? "",
  });
  if (error) dbFail("create location", error);
  return data as string;
}

export async function updateLocation(
  supabase: Db,
  input: {
    businessId: string;
    locationId: string;
    name: string;
    address?: string;
    phone?: string;
  },
) {
  await assertRole(supabase, input.businessId, ["owner", "admin"]);
  await assertCanWrite(supabase, input.businessId);
  const { error } = await supabase.rpc(
    "update_location" as never,
    {
      _business_id: input.businessId,
      _location_id: input.locationId,
      _name: input.name,
      _address: input.address ?? "",
      _phone: input.phone ?? "",
    } as never,
  );
  if (error) dbFail("update location", error);
}

export async function setDefaultLocation(
  supabase: Db,
  input: { businessId: string; locationId: string },
) {
  await assertRole(supabase, input.businessId, ["owner", "admin"]);
  await assertCanWrite(supabase, input.businessId);
  const { error } = await supabase.rpc(
    "set_default_location" as never,
    {
      _business_id: input.businessId,
      _location_id: input.locationId,
    } as never,
  );
  if (error) dbFail("set default location", error);
}

export async function deactivateLocation(
  supabase: Db,
  input: { businessId: string; locationId: string },
) {
  await assertRole(supabase, input.businessId, ["owner", "admin"]);
  await assertCanWrite(supabase, input.businessId);
  const { error } = await supabase.rpc(
    "deactivate_location" as never,
    {
      _business_id: input.businessId,
      _location_id: input.locationId,
    } as never,
  );
  if (error) dbFail("deactivate location", error);
}

type CreateProductRpcArgs = Database["public"]["Functions"]["create_product"]["Args"];

/**
 * Named args for create_product. Staging still has the 13-arg function
 * (no _category_id). PostgREST rejects extra named parameters with PGRST202,
 * which the UI shows as SCHEMA_DRIFT_USER_MESSAGE.
 * Only send _category_id when the merchant actually chose one so onboarding
 * and inventory add still match the current function.
 */
export function createProductRpcArgs(input: ProductInput): CreateProductRpcArgs {
  const args: CreateProductRpcArgs = {
    _business_id: input.businessId,
    _name: input.name,
    _sku: input.sku || "",
    _barcode: input.barcode || "",
    _unit: input.unit,
    _cost_price: input.costPrice,
    _selling_price: input.sellingPrice,
    _stock: input.stock,
    _min_stock: input.minStock,
    _tax_rate: input.taxRate,
    _description: input.description || "",
    _supplier_id: input.supplierId || null,
  };
  if (input.categoryId) {
    args._category_id = input.categoryId;
  }
  return args;
}

export async function createProduct(supabase: Db, input: ProductInput) {
  await assertCanWrite(supabase, input.businessId);
  const { data, error } = await supabase
    .rpc("create_product", createProductRpcArgs(input))
    .single();
  if (error || !data) dbFail("create product", error);
  if (typeof input.wholesalePrice === "number") {
    const { error: wholesaleError } = await supabase
      .from("products")
      .update({ wholesale_price: input.wholesalePrice })
      .eq("id", data.id)
      .eq("business_id", input.businessId);
    if (wholesaleError && !isMissingDbColumn(wholesaleError)) {
      dbFail("save wholesale price", wholesaleError);
    }
  }
  return data;
}

export type ImportResult = { imported: number; skipped: number; errors: string[] };

export async function importProducts(
  supabase: Db,
  userId: string,
  input: { businessId: string; rows: ProductImportRow[] },
): Promise<ImportResult> {
  await assertPermission(supabase, input.businessId, "inventory.import");
  await assertCanWrite(supabase, input.businessId);
  let imported = 0;
  const errors: string[] = [];

  for (const [index, row] of input.rows.entries()) {
    const { data, error } = await supabase.rpc("create_product", {
      _business_id: input.businessId,
      _name: row.name,
      _sku: row.sku || "",
      _barcode: row.barcode || "",
      _unit: row.unit,
      _cost_price: row.costPrice,
      _selling_price: row.sellingPrice,
      _stock: row.stock,
      _min_stock: row.minStock,
      _tax_rate: row.taxRate,
      _description: "",
      _supplier_id: null,
      _location_id: null,
    });
    if (error || !data?.length) {
      const reason =
        (error as { code?: string } | null)?.code === "23505"
          ? "duplicate SKU"
          : "couldn't be saved";
      errors.push(`Row ${index + 2}: ${row.name || "unnamed product"}, ${reason}`);
      continue;
    }
    if (typeof row.wholesalePrice === "number") {
      const productId = data[0]?.id;
      if (productId) {
        await supabase
          .from("products")
          .update({ wholesale_price: row.wholesalePrice })
          .eq("id", productId)
          .eq("business_id", input.businessId);
      }
    }
    imported++;
  }

  await recordAudit(supabase, {
    businessId: input.businessId,
    userId,
    action: "products.imported",
    entityType: "product",
    summary: `Imported ${imported} product${imported === 1 ? "" : "s"} from a spreadsheet`,
    newValues: { imported, skipped: errors.length },
  });

  return { imported, skipped: errors.length, errors };
}

export async function adjustStock(supabase: Db, input: StockAdjustInput) {
  await assertCanWrite(supabase, input.businessId);
  const { data, error } = await supabase.rpc("adjust_stock", {
    _business_id: input.businessId,
    _product_id: input.productId,
    _movement_type: input.movementType,
    _quantity: input.quantity,
    _reason: input.reason || "",
  });
  if (error) dbFail("adjust stock", error);
  return { stock: data as number };
}

/* ------------------------------ customers ------------------------------ */

export async function listCustomers(supabase: Db, businessId: string, search: string) {
  let query = supabase
    .from("customers")
    .select("id, name, phone, email, outstanding_balance, created_at")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  const term = search.trim();
  if (term) query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) dbFail("list customers", error);
  const rows = data ?? [];
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return rows.map((row) => ({ ...row, last_paid_at: null as string | null }));

  const { data: payments, error: payError } = await supabase
    .from("payments")
    .select("customer_id, paid_at")
    .eq("business_id", businessId)
    .in("customer_id", ids)
    .order("paid_at", { ascending: false })
    .limit(500);
  if (payError) dbFail("list customer payments", payError);

  const lastPaid = new Map<string, string>();
  for (const payment of payments ?? []) {
    if (!payment.customer_id || lastPaid.has(payment.customer_id)) continue;
    lastPaid.set(payment.customer_id, payment.paid_at);
  }
  return rows.map((row) => ({
    ...row,
    last_paid_at: lastPaid.get(row.id) ?? null,
  }));
}

export async function createCustomer(supabase: Db, userId: string, input: CustomerInput) {
  await assertPermission(supabase, input.businessId, "customers.create");
  await assertCanWrite(supabase, input.businessId);
  const { data, error } = await supabase
    .from("customers")
    .insert({
      business_id: input.businessId,
      name: input.name,
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
      notes: input.notes || null,
    })
    .select("id, name")
    .single();
  if (error || !data) dbFail("create customer", error);
  await recordAudit(supabase, {
    businessId: input.businessId,
    userId,
    action: "customer.created",
    entityType: "customer",
    entityId: data.id,
    summary: `Added customer ${data.name}`,
  });
  return data;
}

/* ------------------------------ suppliers ------------------------------ */

export async function listSuppliers(supabase: Db, businessId: string, search: string) {
  await assertPermission(supabase, businessId, "suppliers.view");
  let query = supabase
    .from("suppliers")
    .select("id, name, contact_person, phone, email, address, notes, outstanding_amount")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  const term = search.trim();
  if (term) query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) dbFail("list suppliers", error);
  return data ?? [];
}

export async function createSupplier(supabase: Db, userId: string, input: SupplierInput) {
  await assertPermission(supabase, input.businessId, "suppliers.create");
  await assertCanWrite(supabase, input.businessId);
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      business_id: input.businessId,
      name: input.name,
      contact_person: input.contactPerson || null,
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
      notes: input.notes || null,
    })
    .select("id, name")
    .single();
  if (error || !data) dbFail("create supplier", error);
  await recordAudit(supabase, {
    businessId: input.businessId,
    userId,
    action: "supplier.created",
    entityType: "supplier",
    entityId: data.id,
    summary: `Added supplier ${data.name}`,
  });
  return data;
}

export async function updateSupplier(supabase: Db, userId: string, input: UpdateSupplierInput) {
  await assertPermission(supabase, input.businessId, "suppliers.edit");
  await assertCanWrite(supabase, input.businessId);
  const { data, error } = await supabase
    .from("suppliers")
    .update({
      name: input.name,
      contact_person: input.contactPerson || null,
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
      notes: input.notes || null,
    })
    .eq("id", input.supplierId)
    .eq("business_id", input.businessId)
    .select("id, name")
    .maybeSingle();
  if (error) dbFail("update supplier", error);
  if (!data) fail("That supplier could not be found.");
  await recordAudit(supabase, {
    businessId: input.businessId,
    userId,
    action: "supplier.updated",
    entityType: "supplier",
    entityId: data.id,
    summary: `Updated supplier ${data.name}`,
  });
  return data;
}

export async function deleteSupplier(
  supabase: Db,
  userId: string,
  businessId: string,
  supplierId: string,
) {
  await assertPermission(supabase, businessId, "suppliers.delete");
  await assertCanWrite(supabase, businessId);
  const { data, error } = await supabase
    .from("suppliers")
    .delete()
    .eq("id", supplierId)
    .eq("business_id", businessId)
    .select("id, name")
    .maybeSingle();
  if (error) dbFail("delete supplier", error);
  if (!data) fail("That supplier could not be found.");
  await recordAudit(supabase, {
    businessId,
    userId,
    action: "supplier.deleted",
    entityType: "supplier",
    entityId: data.id,
    summary: `Deleted supplier ${data.name}`,
  });
}

/* --------------------------------- sales --------------------------------- */

export async function createSale(supabase: Db, input: SaleInput) {
  await assertCanOperate(supabase, input.businessId);
  await assertPermission(supabase, input.businessId, "sales.create");
  const { data, error } = await supabase.rpc("create_sale", {
    _business_id: input.businessId,
    _customer_id: (input.customerId || null) as never,
    _discount: input.discount,
    _payment_method: input.paymentMethod,
    _notes: (input.notes || null) as never,
    _items: input.items.map((item) => ({
      productId: item.productId || undefined,
      serviceId: item.serviceId || undefined,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })) as never,
    _idempotency_key: input.idempotencyKey,
    _rail: (input.rail || null) as never,
    _tenders: (input.tenders && input.tenders.length > 0
      ? input.tenders.map((tender) => ({
          rail: tender.rail,
          amount: tender.amount,
          currency: tender.currency || null,
          amountOriginal: tender.amountOriginal ?? null,
          reference: tender.reference || null,
        }))
      : null) as never,
  });
  if (error) dbFail("create sale", error);
  void flushNotificationOutboxForBusiness(supabase, input.businessId);
  return { id: data as string };
}

export type SaleRow = {
  id: string;
  sale_number: string;
  customer_id: string | null;
  customer_name: string | null;
  payment_method: string;
  status: string;
  total: number;
  created_at: string;
};

export async function listSales(
  supabase: Db,
  businessId: string,
  search: string,
): Promise<SaleRow[]> {
  let query = supabase
    .from("sales")
    .select(
      "id, sale_number, customer_id, payment_method, status, total, created_at, customers(name)",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(100);
  const term = search.trim();
  if (term) query = query.ilike("sale_number", `%${term}%`);
  const { data, error } = await query;
  if (error) dbFail("list sales", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    sale_number: row.sale_number,
    customer_id: row.customer_id,
    customer_name: (row.customers as unknown as { name: string } | null)?.name ?? null,
    payment_method: row.payment_method,
    status: row.status,
    total: Number(row.total),
    created_at: row.created_at,
  }));
}

export async function getSaleDetail(supabase: Db, businessId: string, saleId: string) {
  const [saleRes, itemsRes, refundsRes, paymentsRes] = await Promise.all([
    supabase
      .from("sales")
      .select("*, customers(name, phone, email)")
      .eq("id", saleId)
      .eq("business_id", businessId)
      .maybeSingle(),
    supabase
      .from("sale_items")
      .select("id, name, sku, quantity, unit_price, tax, line_total")
      .eq("sale_id", saleId)
      .eq("business_id", businessId)
      .order("created_at", { ascending: true }),
    // sale_refund_items has no sale_id of its own (only its parent
    // sale_refund does), going through sale_refunds here is the only way
    // to scope this to one sale rather than pulling every refund in the
    // business.
    supabase
      .from("sale_refunds")
      .select("id, reason, total, created_at, sale_refund_items(sale_item_id, quantity)")
      .eq("sale_id", saleId)
      .eq("business_id", businessId)
      .order("created_at", { ascending: false }),
    supabase
      .from("payments")
      .select("id, amount, method, rail, currency, amount_original, reference, paid_at")
      .eq("sale_id", saleId)
      .eq("business_id", businessId)
      .order("paid_at", { ascending: true }),
  ]);
  if (saleRes.error) dbFail("load sale", saleRes.error);
  if (!saleRes.data) fail("That sale could not be found.");
  if (itemsRes.error) dbFail("load sale items", itemsRes.error);
  if (refundsRes.error) dbFail("load sale refunds", refundsRes.error);
  if (paymentsRes.error) dbFail("load sale payments", paymentsRes.error);

  const refundedByItem = new Map<string, number>();
  for (const refund of refundsRes.data ?? []) {
    for (const line of refund.sale_refund_items as unknown as {
      sale_item_id: string;
      quantity: number;
    }[]) {
      refundedByItem.set(
        line.sale_item_id,
        (refundedByItem.get(line.sale_item_id) ?? 0) + Number(line.quantity),
      );
    }
  }

  return {
    sale: saleRes.data,
    items: (itemsRes.data ?? []).map((item) => ({
      ...item,
      refunded_quantity: refundedByItem.get(item.id) ?? 0,
    })),
    refunds: refundsRes.data ?? [],
    payments: (paymentsRes.data ?? []).map((row) => ({
      id: row.id,
      amount: Number(row.amount),
      method: row.method,
      rail: row.rail,
      currency: row.currency,
      amount_original: row.amount_original == null ? null : Number(row.amount_original),
      reference: row.reference,
      paid_at: row.paid_at,
    })),
  };
}

export async function refundSale(supabase: Db, input: RefundSaleInput) {
  await assertCanWrite(supabase, input.businessId);
  const { error } = await supabase.rpc("refund_sale", {
    _business_id: input.businessId,
    _sale_id: input.saleId,
    _items: input.items.map((item) => ({
      saleItemId: item.saleItemId,
      quantity: item.quantity,
    })) as never,
    _reason: (input.reason || null) as never,
  });
  if (error) dbFail("refund sale", error);
}

/* ------------------------------- invoices ------------------------------- */

export type InvoiceRow = {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string | null;
  issue_date: string;
  due_date: string | null;
  total: number;
  amount_paid: number;
  status: string;
};

function toItemsPayload(items: LineItemInput[]) {
  return items.map((item) => ({
    productId: item.productId || null,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    taxRate: item.taxRate,
  })) as never;
}

export async function listInvoices(
  supabase: Db,
  businessId: string,
  search: string,
): Promise<InvoiceRow[]> {
  let query = supabase
    .from("invoices")
    .select(
      "id, invoice_number, customer_id, issue_date, due_date, total, amount_paid, status, customers(name)",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(100);
  const term = search.trim();
  if (term) query = query.ilike("invoice_number", `%${term}%`);
  const { data, error } = await query;
  if (error) dbFail("list invoices", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    invoice_number: row.invoice_number,
    customer_id: row.customer_id,
    customer_name: (row.customers as unknown as { name: string } | null)?.name ?? null,
    issue_date: row.issue_date,
    due_date: row.due_date,
    total: Number(row.total),
    amount_paid: Number(row.amount_paid),
    status: row.status,
  }));
}

export async function getInvoiceDetail(supabase: Db, businessId: string, invoiceId: string) {
  const [invoiceRes, itemsRes, paymentsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("*, customers(name, phone, email), businesses(name, address, phone, email)")
      .eq("id", invoiceId)
      .eq("business_id", businessId)
      .maybeSingle(),
    supabase
      .from("invoice_items")
      .select("id, name, quantity, unit_price, tax, line_total")
      .eq("invoice_id", invoiceId)
      .eq("business_id", businessId)
      .order("created_at", { ascending: true }),
    supabase
      .from("payments")
      .select("id, amount, method, reference, paid_at")
      .eq("invoice_id", invoiceId)
      .eq("business_id", businessId)
      .order("paid_at", { ascending: false }),
  ]);
  if (invoiceRes.error) dbFail("load invoice", invoiceRes.error);
  if (!invoiceRes.data) fail("That invoice could not be found.");
  if (itemsRes.error) dbFail("load invoice items", itemsRes.error);
  if (paymentsRes.error) dbFail("load invoice payments", paymentsRes.error);
  const invoice = invoiceRes.data;
  return {
    invoice: {
      ...invoice,
      subtotal: Number(invoice.subtotal),
      discount: Number(invoice.discount),
      tax: Number(invoice.tax),
      total: Number(invoice.total),
      amount_paid: Number(invoice.amount_paid),
    },
    items: (itemsRes.data ?? []).map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      tax: Number(item.tax),
      line_total: Number(item.line_total),
    })),
    payments: (paymentsRes.data ?? []).map((payment) => ({
      ...payment,
      amount: Number(payment.amount),
    })),
  };
}

export async function createInvoice(supabase: Db, input: InvoiceInput) {
  await assertCanWrite(supabase, input.businessId);
  const { data, error } = await supabase.rpc("create_invoice", {
    _business_id: input.businessId,
    _customer_id: (input.customerId || null) as never,
    _issue_date: input.issueDate,
    _due_date: (input.dueDate || null) as never,
    _notes: (input.notes || null) as never,
    _terms: (input.terms || null) as never,
    _discount: input.discount,
    _items: toItemsPayload(input.items),
    _idempotency_key: input.idempotencyKey,
  });
  if (error) dbFail("create invoice", error);
  return { id: data as string };
}

export type RecurringInvoiceRow = {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  interval: string;
  next_issue_date: string;
  due_days: number;
  discount: number;
  is_active: boolean;
  items: { name: string; quantity: number; unitPrice: number }[];
};

export async function listRecurringInvoices(
  supabase: Db,
  businessId: string,
): Promise<RecurringInvoiceRow[]> {
  const { data, error } = await supabase
    .from("recurring_invoices")
    .select(
      "id, customer_id, interval, next_issue_date, due_days, discount, is_active, items, customers(name)",
    )
    .eq("business_id", businessId)
    .order("next_issue_date", { ascending: true });
  if (error) dbFail("list recurring invoices", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    customer_id: row.customer_id,
    customer_name: (row.customers as unknown as { name: string } | null)?.name ?? null,
    interval: row.interval,
    next_issue_date: row.next_issue_date,
    due_days: row.due_days,
    discount: Number(row.discount),
    is_active: row.is_active,
    items: row.items as { name: string; quantity: number; unitPrice: number }[],
  }));
}

export async function createRecurringInvoice(supabase: Db, input: RecurringInvoiceInput) {
  await assertCanWrite(supabase, input.businessId);
  const { data, error } = await supabase.rpc("create_recurring_invoice", {
    _business_id: input.businessId,
    _customer_id: input.customerId,
    _interval: input.interval,
    _start_date: input.startDate,
    _due_days: input.dueDays,
    _discount: input.discount,
    _notes: (input.notes || null) as never,
    _terms: (input.terms || null) as never,
    _items: toItemsPayload(input.items),
  });
  if (error) dbFail("create recurring invoice", error);
  return { id: data as string };
}

export async function setRecurringInvoiceActive(
  supabase: Db,
  businessId: string,
  recurringInvoiceId: string,
  active: boolean,
) {
  await assertCanWrite(supabase, businessId);
  const { error } = await supabase.rpc("set_recurring_invoice_active", {
    _business_id: businessId,
    _id: recurringInvoiceId,
    _active: active,
  });
  if (error) dbFail("update recurring invoice", error);
}

export async function deleteRecurringInvoice(
  supabase: Db,
  businessId: string,
  recurringInvoiceId: string,
) {
  await assertCanWrite(supabase, businessId);
  const { error } = await supabase.rpc("delete_recurring_invoice", {
    _business_id: businessId,
    _id: recurringInvoiceId,
  });
  if (error) dbFail("delete recurring invoice", error);
}

export async function setInvoiceStatus(supabase: Db, input: InvoiceStatusInput) {
  await assertCanWrite(supabase, input.businessId);
  const { error } = await supabase.rpc("set_invoice_status", {
    _business_id: input.businessId,
    _invoice_id: input.invoiceId,
    _status: input.status,
  });
  if (error) dbFail("update invoice status", error);
  return { ok: true };
}

export async function recordInvoicePayment(supabase: Db, input: PaymentInput) {
  await assertCanWrite(supabase, input.businessId);
  const { data, error } = await supabase.rpc("record_invoice_payment", {
    _business_id: input.businessId,
    _invoice_id: input.invoiceId,
    _amount: input.amount,
    _method: input.method,
    _reference: (input.reference || null) as never,
    _idempotency_key: input.idempotencyKey,
  });
  if (error) dbFail("record payment", error);
  return { id: data as string };
}

export async function recordCustomerCreditPayment(supabase: Db, input: CreditPaymentInput) {
  await assertCanOperate(supabase, input.businessId);
  await assertPermission(supabase, input.businessId, "payments.record");
  const { data, error } = await supabase.rpc("record_customer_credit_payment", {
    _business_id: input.businessId,
    _customer_id: input.customerId,
    _amount: input.amount,
    _method: input.method,
    _rail: (input.rail || null) as never,
    _reference: (input.reference || null) as never,
    _idempotency_key: input.idempotencyKey,
  });
  if (error) dbFail("record credit repayment", error);
  return { id: data as string };
}

export async function recordSupplierPayment(supabase: Db, input: SupplierPaymentInput) {
  await assertCanOperate(supabase, input.businessId);
  await assertPermission(supabase, input.businessId, "payments.record");
  const { data, error } = await supabase.rpc("record_supplier_payment", {
    _business_id: input.businessId,
    _supplier_id: input.supplierId,
    _amount: input.amount,
    _method: input.method,
    _rail: (input.rail || null) as never,
    _reference: (input.reference || null) as never,
    _idempotency_key: input.idempotencyKey,
  });
  if (error) dbFail("record supplier payment", error);
  return { id: data as string };
}

export async function takeCustomerDeposit(supabase: Db, input: CustomerDepositInput) {
  await assertCanOperate(supabase, input.businessId);
  await assertPermission(supabase, input.businessId, "payments.record");
  const { data, error } = await supabase.rpc("take_customer_deposit", {
    _business_id: input.businessId,
    _customer_id: input.customerId,
    _amount: input.amount,
    _method: input.method,
    _rail: (input.rail || null) as never,
    _reference: (input.reference || null) as never,
    _idempotency_key: input.idempotencyKey,
  });
  if (error) dbFail("take customer deposit", error);
  return { id: data as string };
}

export async function refundCustomerDeposit(
  supabase: Db,
  input: { businessId: string; depositId: string },
) {
  await assertCanOperate(supabase, input.businessId);
  await assertPermission(supabase, input.businessId, "payments.record");
  const { data, error } = await supabase.rpc("refund_customer_deposit", {
    _business_id: input.businessId,
    _deposit_id: input.depositId,
  });
  if (error) dbFail("refund customer deposit", error);
  return { id: data as string };
}

export async function applyCustomerDeposit(supabase: Db, input: ApplyDepositInput) {
  await assertCanOperate(supabase, input.businessId);
  await assertPermission(supabase, input.businessId, "payments.record");
  const { data, error } = await supabase.rpc("apply_customer_deposit", {
    _business_id: input.businessId,
    _deposit_id: input.depositId,
    _target: input.target,
    _layby_id: (input.laybyId ?? null) as never,
  });
  if (error) dbFail("apply customer deposit", error);
  return { id: data as string };
}

export async function listCustomerDeposits(supabase: Db, businessId: string, customerId?: string) {
  let query = supabase
    .from("customer_deposits")
    .select(
      "id, customer_id, amount, status, method, rail, reference, applied_to, layby_id, created_at, customers(name)",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (customerId) query = query.eq("customer_id", customerId);
  const { data, error } = await query;
  if (error) dbFail("list customer deposits", error);
  return data ?? [];
}

export async function listLaybys(supabase: Db, businessId: string) {
  const { data, error } = await supabase
    .from("laybys")
    .select(
      "id, layby_number, status, total, amount_paid, collect_after, notes, created_at, customer_id, sale_id, customers(name, phone)",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) dbFail("list lay-bys", error);
  return data ?? [];
}

export async function listLaybyItems(supabase: Db, businessId: string, laybyId: string) {
  const { data, error } = await supabase
    .from("layby_items")
    .select("id, product_id, name, quantity, unit_price, tax, line_total")
    .eq("business_id", businessId)
    .eq("layby_id", laybyId)
    .order("created_at", { ascending: true });
  if (error) dbFail("list lay-by items", error);
  return data ?? [];
}

export async function createLayby(supabase: Db, input: CreateLaybyInput) {
  await assertCanOperate(supabase, input.businessId);
  await assertPermission(supabase, input.businessId, "sales.create");
  const { data, error } = await supabase.rpc("create_layby", {
    _business_id: input.businessId,
    _customer_id: input.customerId,
    _items: input.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    })),
    _collect_after: (input.collectAfter ?? null) as never,
    _notes: (input.notes || null) as never,
  });
  if (error) dbFail("create lay-by", error);
  return { id: data as string };
}

export async function recordLaybyInstalment(supabase: Db, input: LaybyInstalmentInput) {
  await assertCanOperate(supabase, input.businessId);
  await assertPermission(supabase, input.businessId, "payments.record");
  const { data, error } = await supabase.rpc("record_layby_instalment", {
    _business_id: input.businessId,
    _layby_id: input.laybyId,
    _amount: input.amount,
    _method: input.method,
    _rail: (input.rail || null) as never,
    _reference: (input.reference || null) as never,
    _idempotency_key: input.idempotencyKey,
  });
  if (error) dbFail("record lay-by instalment", error);
  return { id: data as string };
}

export async function collectLayby(supabase: Db, input: CollectLaybyInput) {
  await assertCanOperate(supabase, input.businessId);
  await assertPermission(supabase, input.businessId, "sales.create");
  const { data, error } = await supabase.rpc("collect_layby", {
    _business_id: input.businessId,
    _layby_id: input.laybyId,
    _location_id: (input.locationId ?? null) as never,
  });
  if (error) dbFail("collect lay-by", error);
  return { id: data as string };
}

export async function cancelLayby(supabase: Db, input: { businessId: string; laybyId: string }) {
  await assertCanOperate(supabase, input.businessId);
  await assertPermission(supabase, input.businessId, "sales.create");
  const { data, error } = await supabase.rpc("cancel_layby", {
    _business_id: input.businessId,
    _layby_id: input.laybyId,
  });
  if (error) dbFail("cancel lay-by", error);
  return { id: data as string };
}

/* -------------------------------- quotes -------------------------------- */

export type QuoteRow = {
  id: string;
  quote_number: string;
  customer_id: string | null;
  customer_name: string | null;
  issue_date: string;
  valid_until: string | null;
  total: number;
  status: string;
  converted_invoice_id: string | null;
};

export async function listQuotes(
  supabase: Db,
  businessId: string,
  search: string,
): Promise<QuoteRow[]> {
  let query = supabase
    .from("quotes")
    .select(
      "id, quote_number, customer_id, issue_date, valid_until, total, status, converted_invoice_id, customers(name)",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(100);
  const term = search.trim();
  if (term) query = query.ilike("quote_number", `%${term}%`);
  const { data, error } = await query;
  if (error) dbFail("list quotes", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    quote_number: row.quote_number,
    customer_id: row.customer_id,
    customer_name: (row.customers as unknown as { name: string } | null)?.name ?? null,
    issue_date: row.issue_date,
    valid_until: row.valid_until,
    total: Number(row.total),
    status: row.status,
    converted_invoice_id: row.converted_invoice_id,
  }));
}

export async function getQuoteDetail(supabase: Db, businessId: string, quoteId: string) {
  const [quoteRes, itemsRes] = await Promise.all([
    supabase
      .from("quotes")
      .select("*, customers(name, phone, email), businesses(name, address, phone, email)")
      .eq("id", quoteId)
      .eq("business_id", businessId)
      .maybeSingle(),
    supabase
      .from("quote_items")
      .select("id, name, quantity, unit_price, tax, line_total")
      .eq("quote_id", quoteId)
      .eq("business_id", businessId)
      .order("created_at", { ascending: true }),
  ]);
  if (quoteRes.error) dbFail("load quote", quoteRes.error);
  if (!quoteRes.data) fail("That quote could not be found.");
  if (itemsRes.error) dbFail("load quote items", itemsRes.error);
  const quote = quoteRes.data;
  return {
    quote: {
      ...quote,
      subtotal: Number(quote.subtotal),
      discount: Number(quote.discount),
      tax: Number(quote.tax),
      total: Number(quote.total),
    },
    items: (itemsRes.data ?? []).map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      tax: Number(item.tax),
      line_total: Number(item.line_total),
    })),
  };
}

export async function createQuote(supabase: Db, input: QuoteInput) {
  await assertCanWrite(supabase, input.businessId);
  const { data, error } = await supabase.rpc("create_quote", {
    _business_id: input.businessId,
    _customer_id: (input.customerId || null) as never,
    _issue_date: input.issueDate,
    _valid_until: (input.validUntil || null) as never,
    _notes: (input.notes || null) as never,
    _terms: (input.terms || null) as never,
    _discount: input.discount,
    _items: toItemsPayload(input.items),
  });
  if (error) dbFail("create quote", error);
  return { id: data as string };
}

/* --------------------------- purchase orders --------------------------- */

export type PurchaseOrderRow = {
  id: string;
  po_number: string;
  supplier_id: string | null;
  supplier_name: string | null;
  order_date: string;
  total: number;
  status: string;
};

export async function listPurchaseOrders(
  supabase: Db,
  businessId: string,
): Promise<PurchaseOrderRow[]> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("id, po_number, supplier_id, order_date, total, status, suppliers(name)")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) dbFail("list purchase orders", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    po_number: row.po_number,
    supplier_id: row.supplier_id,
    supplier_name: (row.suppliers as unknown as { name: string } | null)?.name ?? null,
    order_date: row.order_date,
    total: Number(row.total),
    status: row.status,
  }));
}

export async function createPurchaseOrder(supabase: Db, input: PurchaseOrderInput) {
  await assertPermission(supabase, input.businessId, "purchase_orders.create");
  await assertCanWrite(supabase, input.businessId);
  const { data, error } = await supabase.rpc("create_purchase_order", {
    _business_id: input.businessId,
    _supplier_id: (input.supplierId || null) as never,
    _order_date: input.orderDate,
    _notes: (input.notes || null) as never,
    _items: toItemsPayload(input.items),
  });
  if (error) dbFail("create purchase order", error);
  return { id: data as string };
}

/** Receiving isn't just a label flip, set_purchase_order_status also adds a
 * stock_in movement per line item with a linked product, same as a manual
 * restock. Audit logging happens inside that function too (it needs the PO's
 * previous status either way, already has it from its own row lock). */
export async function setPurchaseOrderStatus(supabase: Db, input: PurchaseOrderStatusInput) {
  await assertPermission(supabase, input.businessId, "purchase_orders.create");
  await assertCanWrite(supabase, input.businessId);
  const { error } = await supabase.rpc("set_purchase_order_status", {
    _business_id: input.businessId,
    _po_id: input.purchaseOrderId,
    _status: input.status,
  });
  if (error) dbFail("update purchase order status", error);
}

export async function setQuoteStatus(supabase: Db, userId: string, input: QuoteStatusInput) {
  await assertPermission(supabase, input.businessId, "quotes.manage");
  await assertCanWrite(supabase, input.businessId);
  const { data, error } = await supabase
    .from("quotes")
    .update({ status: input.status })
    .eq("id", input.quoteId)
    .eq("business_id", input.businessId)
    .neq("status", "converted")
    .select("id, quote_number")
    .maybeSingle();
  if (error) dbFail("update quote status", error);
  if (!data) fail("That quote could not be updated. It may already be converted.");
  await recordAudit(supabase, {
    businessId: input.businessId,
    userId,
    action: "quote.status_changed",
    entityType: "quote",
    entityId: data.id,
    summary: `Quote ${data.quote_number} marked ${input.status}`,
    newValues: { status: input.status },
  });
  return { ok: true };
}

export async function convertQuote(supabase: Db, input: ConvertQuoteInput) {
  await assertCanWrite(supabase, input.businessId);
  const { data, error } = await supabase.rpc("convert_quote_to_invoice", {
    _business_id: input.businessId,
    _quote_id: input.quoteId,
    _due_date: (input.dueDate || null) as never,
  });
  if (error) dbFail("convert quote", error);
  return { invoiceId: data as string };
}

/* -------------------------------- expenses -------------------------------- */

export type ExpenseRow = {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  expense_date: string;
  method: string;
  vendor: string | null;
};

export async function listExpenses(
  supabase: Db,
  businessId: string,
  days: number,
): Promise<ExpenseRow[]> {
  await assertAnyPermission(supabase, businessId, ["reports.financial", "expenses.create"]);
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from("expenses")
    .select("id, category, description, amount, expense_date, method, vendor")
    .eq("business_id", businessId)
    .gte("expense_date", since.toISOString().slice(0, 10))
    .order("expense_date", { ascending: false })
    .limit(200);
  if (error) dbFail("list expenses", error);
  return (data ?? []).map((row) => ({ ...row, amount: Number(row.amount) }));
}

export async function createExpense(supabase: Db, userId: string, input: ExpenseInput) {
  await assertPermission(supabase, input.businessId, "expenses.create");
  await assertCanWrite(supabase, input.businessId);
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      business_id: input.businessId,
      category: input.category,
      description: input.description || null,
      amount: input.amount,
      expense_date: input.expenseDate,
      method: input.method,
      vendor: input.vendor || null,
      created_by: userId,
    })
    .select("id, category, amount")
    .single();
  if (error || !data) dbFail("create expense", error);
  await recordAudit(supabase, {
    businessId: input.businessId,
    userId,
    action: "expense.created",
    entityType: "expense",
    entityId: data.id,
    summary: `Recorded ${data.category} expense`,
    newValues: { amount: data.amount, category: data.category },
  });
  return data;
}

export async function deleteExpense(
  supabase: Db,
  userId: string,
  businessId: string,
  expenseId: string,
) {
  await assertPermission(supabase, businessId, "expenses.delete");
  await assertCanWrite(supabase, businessId);
  const { data, error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", expenseId)
    .eq("business_id", businessId)
    .select("id, category, amount")
    .maybeSingle();
  if (error) dbFail("delete expense", error);
  if (!data) fail("That expense could not be found.");
  await recordAudit(supabase, {
    businessId,
    userId,
    action: "expense.deleted",
    entityType: "expense",
    entityId: data.id,
    summary: `Deleted ${data.category} expense`,
    oldValues: { amount: data.amount },
  });
  return { ok: true };
}

export async function importExpenses(
  supabase: Db,
  userId: string,
  input: { businessId: string; rows: ExpenseImportRow[] },
): Promise<ImportResult> {
  await assertPermission(supabase, input.businessId, "expenses.import");
  await assertCanWrite(supabase, input.businessId);
  let imported = 0;
  const errors: string[] = [];

  for (const [index, row] of input.rows.entries()) {
    const { error } = await supabase.from("expenses").insert({
      business_id: input.businessId,
      category: row.category,
      description: row.description || null,
      amount: row.amount,
      expense_date: row.expenseDate,
      vendor: row.vendor || null,
      created_by: userId,
    });
    if (error) {
      errors.push(`Row ${index + 2}: ${row.expenseDate}, couldn't be saved`);
      continue;
    }
    imported++;
  }

  await recordAudit(supabase, {
    businessId: input.businessId,
    userId,
    action: "expenses.imported",
    entityType: "expense",
    summary: `Imported ${imported} expense${imported === 1 ? "" : "s"} from a spreadsheet`,
    newValues: { imported, skipped: errors.length },
  });

  return { imported, skipped: errors.length, errors };
}

/** Historical sales entered for reporting only, deliberately does NOT touch
 * current stock or create inventory movements, since these sales already
 * happened before the business started using this system. */
export async function importSalesHistory(
  supabase: Db,
  userId: string,
  input: { businessId: string; rows: SaleHistoryImportRow[] },
): Promise<ImportResult> {
  await assertPermission(supabase, input.businessId, "sales.import");
  await assertCanWrite(supabase, input.businessId);
  let imported = 0;
  const errors: string[] = [];

  for (const [index, row] of input.rows.entries()) {
    const saleDate = new Date(row.saleDate);
    if (Number.isNaN(saleDate.getTime())) {
      errors.push(`Row ${index + 2}: invalid date "${row.saleDate}"`);
      continue;
    }
    const { error } = await supabase.rpc("import_sale_history_row", {
      _business_id: input.businessId,
      _sale_date: saleDate.toISOString(),
      _total: row.total,
      _cost: row.cost,
      _description: (row.description || null) as never,
    });
    if (error) {
      errors.push(`Row ${index + 2}: ${row.saleDate}, couldn't be saved`);
      continue;
    }
    imported++;
  }

  await recordAudit(supabase, {
    businessId: input.businessId,
    userId,
    action: "sales.imported",
    entityType: "sale",
    summary: `Imported ${imported} historical sale${imported === 1 ? "" : "s"} from a spreadsheet`,
    newValues: { imported, skipped: errors.length },
  });

  return { imported, skipped: errors.length, errors };
}

export async function importCustomers(
  supabase: Db,
  userId: string,
  input: { businessId: string; rows: CustomerImportRow[] },
): Promise<ImportResult> {
  await assertPermission(supabase, input.businessId, "customers.import");
  await assertCanWrite(supabase, input.businessId);
  let imported = 0;
  const errors: string[] = [];

  for (const [index, row] of input.rows.entries()) {
    const { error } = await supabase.from("customers").insert({
      business_id: input.businessId,
      name: row.name,
      phone: row.phone || null,
      email: row.email || null,
      address: row.address || null,
      notes: row.notes || null,
    });
    if (error) {
      errors.push(`Row ${index + 2}: ${row.name || "unnamed customer"}, couldn't be saved`);
      continue;
    }
    imported++;
  }

  await recordAudit(supabase, {
    businessId: input.businessId,
    userId,
    action: "customers.imported",
    entityType: "customer",
    summary: `Imported ${imported} customer${imported === 1 ? "" : "s"} from a spreadsheet`,
    newValues: { imported, skipped: errors.length },
  });

  return { imported, skipped: errors.length, errors };
}

/** Real line-item historical sales, one row = one product = one sale.
 * Resolves product/customer names against this business's own records
 * (same deterministic substring search Inventory/Customers search already
 * use) before calling import_sale_line, which decrements stock and writes
 * every timestamp as the row's own date rather than "now". Kept as its own
 * RPC rather than a create_sale parameter, see import_sale_line's own
 * comment for why. */
export async function importSalesDetailed(
  supabase: Db,
  userId: string,
  input: { businessId: string; rows: SaleLineImportRow[] },
): Promise<ImportResult> {
  await assertPermission(supabase, input.businessId, "sales.import");
  await assertCanWrite(supabase, input.businessId);
  let imported = 0;
  const errors: string[] = [];

  for (const [index, row] of input.rows.entries()) {
    const saleDate = new Date(row.saleDate);
    if (Number.isNaN(saleDate.getTime())) {
      errors.push(`Row ${index + 2}: invalid date "${row.saleDate}"`);
      continue;
    }
    const products = await listProducts(supabase, input.businessId, row.product);
    const product = products[0];
    if (!product) {
      errors.push(`Row ${index + 2}: no product matching "${row.product}"`);
      continue;
    }
    let customerId: string | null = null;
    if (row.customer) {
      const customers = await listCustomers(supabase, input.businessId, row.customer);
      customerId = customers[0]?.id ?? null;
    }
    const { error } = await supabase.rpc("import_sale_line", {
      _business_id: input.businessId,
      _sale_date: saleDate.toISOString(),
      _product_id: product.id,
      _quantity: row.quantity,
      _unit_price: (row.unitPrice ?? null) as never,
      _customer_id: customerId as never,
      _payment_method: row.paymentMethod,
      _notes: null as never,
    });
    if (error) {
      errors.push(`Row ${index + 2}: ${row.product}, couldn't be saved`);
      continue;
    }
    imported++;
  }

  await recordAudit(supabase, {
    businessId: input.businessId,
    userId,
    action: "sales.imported_detailed",
    entityType: "sale",
    summary: `Imported ${imported} detailed sale${imported === 1 ? "" : "s"} from a spreadsheet`,
    newValues: { imported, skipped: errors.length },
  });

  return { imported, skipped: errors.length, errors };
}

/* ------------------------------ dashboard ------------------------------ */

export type DailyTakingsRail = { rail: string; method: string; amount: number };

export type DailyTakings = {
  day: string;
  timezone: string;
  received: DailyTakingsRail[];
  creditOnAccount: number;
};

export type DashboardDebtor = { id: string; name: string; outstanding: number };

export type DashboardData = {
  currency: string;
  todaySales: number | null;
  todayProfit: number | null;
  todayExpenses: number | null;
  todayEstimatedProfit: number | null;
  salesChange: number;
  profitChange: number;
  outstanding: number;
  outstandingCustomers: number;
  lowStockCount: number;
  urgentStockCount: number;
  series: { label: string; sales: number; profit: number }[];
  health: { score: number; label: string; signals: { tone: string; text: string }[] };
  lowStock: { id: string; name: string; stock: number; min_stock: number; unit: string }[];
  todayTakings: DailyTakings;
  debtors: DashboardDebtor[];
  recentActivity: {
    type: "sale" | "expense";
    description: string;
    amount: number;
    date: string;
  }[];
};

const EMPTY_TAKINGS: DailyTakings = {
  day: "",
  timezone: "Africa/Harare",
  received: [],
  creditOnAccount: 0,
};

export async function loadDailyTakings(supabase: Db, businessId: string): Promise<DailyTakings> {
  const { data, error } = await supabase.rpc("get_daily_takings", {
    _business_id: businessId,
  });
  if (error) {
    if (skipMissingRpc("daily takings", error)) return EMPTY_TAKINGS;
    dbFail("daily takings", error);
  }
  const raw = data as {
    day?: string;
    timezone?: string;
    received?: { rail?: string; method?: string; amount?: number }[] | null;
    creditOnAccount?: number;
  } | null;
  return {
    day: String(raw?.day ?? ""),
    timezone: String(raw?.timezone ?? "Africa/Harare"),
    received: (raw?.received ?? []).map((row) => ({
      rail: String(row.rail ?? row.method ?? ""),
      method: String(row.method ?? ""),
      amount: round2(Number(row.amount ?? 0)),
    })),
    creditOnAccount: round2(Number(raw?.creditOnAccount ?? 0)),
  };
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function loadDashboard(
  supabase: Db,
  businessId: string,
  days: number,
): Promise<DashboardData> {
  await assertMember(supabase, businessId);
  const permissionChecks = ["expenses.create", "inventory.import", "reports.financial"] as const;
  const permissionResults = await Promise.all(
    permissionChecks.map(async (permission) => {
      const { data, error } = await supabase.rpc("has_permission", {
        _business_id: businessId,
        _permission: permission,
      });
      if (error) dbFail("dashboard permission check", error);
      return [permission, data === true] as const;
    }),
  );
  const permissions = new Map(permissionResults);
  const canReadSales = permissions.get("reports.financial");
  const canReadExpenses =
    permissions.get("expenses.create") || permissions.get("reports.financial");
  const canReadInventory =
    permissions.get("inventory.import") || permissions.get("reports.financial");
  const canReadFinancials = permissions.get("reports.financial");
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - (days * 2 - 1));
  windowStart.setHours(0, 0, 0, 0);

  type DashboardSale = { total: number; cost_total: number; created_at: string };
  let sales: DashboardSale[] = [];
  if (canReadSales && canReadFinancials) {
    const result = await supabase
      .from("sales")
      .select("total, cost_total, created_at")
      .eq("business_id", businessId)
      .in("status", ["completed", "partially_refunded"])
      .gte("created_at", windowStart.toISOString());
    if (result.error) dbFail("dashboard sales", result.error);
    sales = (result.data ?? []).map((sale) => ({
      total: Number(sale.total ?? 0),
      cost_total: Number(sale.cost_total ?? 0),
      created_at: sale.created_at,
    }));
  } else if (canReadSales) {
    const result = await supabase
      .from("sales")
      .select("total, created_at")
      .eq("business_id", businessId)
      .in("status", ["completed", "partially_refunded"])
      .gte("created_at", windowStart.toISOString());
    if (result.error) dbFail("dashboard sales", result.error);
    sales = (result.data ?? []).map((sale) => ({
      total: Number(sale.total ?? 0),
      cost_total: 0,
      created_at: sale.created_at,
    }));
  }

  const [businessRes, invoiceRes, productRes, expenseRes, debtorsRes, takings] = await Promise.all([
    supabase.from("businesses").select("currency").eq("id", businessId).maybeSingle(),
    // No date filter is possible here by design, an unpaid invoice from
    // last year is still "outstanding" today, so .limit() is the only
    // available bound. Safety net only: a business that somehow exceeds it
    // would see an understated outstanding total, not an error, but this is
    // far beyond realistic usage for this app's target market.
    canReadFinancials
      ? supabase
          .from("invoices")
          .select("customer_id, total, amount_paid, status, due_date")
          .eq("business_id", businessId)
          .in("status", ["sent", "partially_paid", "overdue"])
          .limit(2000)
      : Promise.resolve({ data: [], error: null }),
    canReadInventory
      ? supabase
          .from("products")
          .select("id, name, stock, min_stock, unit")
          .eq("business_id", businessId)
          .is("deleted_at", null)
          .eq("is_active", true)
          .limit(500)
      : Promise.resolve({ data: [], error: null }),
    canReadExpenses
      ? supabase
          .from("expenses")
          .select("amount, expense_date, description")
          .eq("business_id", businessId)
          .gte("expense_date", dayKey(windowStart))
      : Promise.resolve({ data: [], error: null }),
    canReadFinancials
      ? supabase
          .from("customers")
          .select("id, name, outstanding_balance")
          .eq("business_id", businessId)
          .is("deleted_at", null)
          .gt("outstanding_balance", 0)
          .order("outstanding_balance", { ascending: false })
          .limit(1000)
      : Promise.resolve({ data: [], error: null }),
    canReadFinancials ? loadDailyTakings(supabase, businessId) : Promise.resolve(EMPTY_TAKINGS),
  ]);

  const currency = businessRes.data?.currency ?? "USD";
  const invoices = invoiceRes.data ?? [];
  const products = productRes.data ?? [];
  const expenses = expenseRes.data ?? [];

  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - (days - 1));
  periodStart.setHours(0, 0, 0, 0);

  const current = { sales: 0, profit: 0 };
  const previous = { sales: 0, profit: 0 };
  const buckets = new Map<string, { sales: number; profit: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    buckets.set(dayKey(d), { sales: 0, profit: 0 });
  }

  for (const sale of sales) {
    const total = sale.total;
    const profit = canReadFinancials ? total - sale.cost_total : 0;
    const created = new Date(sale.created_at);
    if (created >= periodStart) {
      current.sales += total;
      current.profit += profit;
      const bucket = buckets.get(dayKey(created));
      if (bucket) {
        bucket.sales += total;
        bucket.profit += profit;
      }
    } else {
      previous.sales += total;
      previous.profit += profit;
    }
  }

  const todayKey = dayKey(now);
  const today = buckets.get(todayKey) ?? { sales: 0, profit: 0 };

  const allDebtors = (debtorsRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    outstanding: round2(Number(row.outstanding_balance ?? 0)),
  }));
  const outstanding = allDebtors.reduce((sum, row) => sum + row.outstanding, 0);
  const outstandingCustomers = allDebtors.length;
  const debtors = allDebtors.slice(0, 8);
  const overdueCount = invoices.filter(
    (inv) => inv.due_date && new Date(inv.due_date) < now,
  ).length;

  const lowStock = products
    .filter((p) => Number(p.stock) <= Number(p.min_stock))
    .sort((a, b) => Number(a.stock) - Number(b.stock))
    .slice(0, 6);
  const lowStockCount = products.filter((p) => Number(p.stock) <= Number(p.min_stock)).length;
  const urgentStockCount = products.filter((p) => Number(p.stock) <= 0).length;
  const expenseTotal = expenses.reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
  const todayExpenses = expenses.reduce(
    (sum, expense) => (expense.expense_date === todayKey ? sum + Number(expense.amount ?? 0) : sum),
    0,
  );
  const recentActivity = [
    ...sales.map((sale) => ({
      type: "sale" as const,
      description: "Sale recorded",
      amount: sale.total,
      date: sale.created_at,
    })),
    ...expenses.map((expense) => ({
      type: "expense" as const,
      description: expense.description || "Expense recorded",
      amount: Number(expense.amount ?? 0),
      date: expense.expense_date,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  const pct = (curr: number, prev: number) =>
    prev > 0 ? ((curr - prev) / prev) * 100 : curr > 0 ? 100 : 0;
  const salesChange = pct(current.sales, previous.sales);
  const profitChange = pct(current.profit, previous.profit);

  // Deterministic business-health rules (no AI required).
  let score = 60;
  const signals: { tone: string; text: string }[] = [];

  if (current.sales > 0) {
    score += 8;
    if (salesChange >= 5) {
      score += 10;
      signals.push({ tone: "good", text: `Revenue increased ${Math.round(salesChange)}%` });
    } else if (salesChange <= -5) {
      score -= 10;
      signals.push({ tone: "warn", text: `Revenue dropped ${Math.abs(Math.round(salesChange))}%` });
    } else {
      signals.push({ tone: "good", text: "Revenue is steady" });
    }
  } else {
    score -= 10;
    signals.push({ tone: "warn", text: "No sales recorded in this period" });
  }

  const margin = current.sales > 0 ? (current.profit / current.sales) * 100 : 0;
  if (current.sales > 0) {
    if (margin >= 20) {
      score += 8;
      signals.push({ tone: "good", text: `Healthy profit margin of ${Math.round(margin)}%` });
    } else {
      score -= 6;
      signals.push({ tone: "warn", text: `Thin profit margin of ${Math.round(margin)}%` });
    }
  }

  if (products.length === 0) {
    score -= 8;
    signals.push({ tone: "warn", text: "No products added yet" });
  } else if (lowStockCount === 0) {
    score += 8;
    signals.push({ tone: "good", text: "Inventory is stable" });
  } else {
    score -= Math.min(lowStockCount * 2, 12);
    signals.push({
      tone: "warn",
      text: `${lowStockCount} product${lowStockCount === 1 ? "" : "s"} running low`,
    });
  }

  if (overdueCount > 0) {
    score -= Math.min(overdueCount * 3, 12);
    signals.push({
      tone: "warn",
      text: `${overdueCount} invoice${overdueCount === 1 ? "" : "s"} overdue`,
    });
  } else if (invoices.length > 0) {
    signals.push({ tone: "info", text: "All invoices are still within terms" });
  }
  if (outstandingCustomers > 0) {
    signals.push({
      tone: "info",
      text: `${outstandingCustomers} customer${outstandingCustomers === 1 ? "" : "s"} on the credit book`,
    });
  }

  if (expenseTotal > current.sales && current.sales > 0) {
    score -= 8;
    signals.push({ tone: "warn", text: "Expenses are higher than sales" });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const label =
    score >= 80 ? "Healthy" : score >= 60 ? "Stable" : score >= 40 ? "Needs attention" : "At risk";

  return {
    currency,
    todaySales: canReadSales ? today.sales : null,
    todayProfit: canReadFinancials ? today.profit : null,
    todayExpenses: canReadExpenses ? round2(todayExpenses) : null,
    todayEstimatedProfit: canReadFinancials ? round2(today.sales - todayExpenses) : null,
    salesChange: canReadFinancials ? salesChange : 0,
    profitChange: canReadFinancials ? profitChange : 0,
    outstanding,
    outstandingCustomers,
    lowStockCount,
    urgentStockCount,
    series: canReadFinancials
      ? [...buckets.entries()].map(([key, value]) => ({
          label: new Date(key).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          sales: Math.round(value.sales * 100) / 100,
          profit: Math.round(value.profit * 100) / 100,
        }))
      : [],
    health: canReadFinancials
      ? { score, label, signals: signals.slice(0, 6) }
      : { score: 0, label: "Overview", signals: [] },
    lowStock: canReadInventory
      ? lowStock.map((p) => ({
          id: p.id,
          name: p.name,
          stock: Number(p.stock),
          min_stock: Number(p.min_stock),
          unit: p.unit,
        }))
      : [],
    todayTakings: canReadFinancials ? takings : EMPTY_TAKINGS,
    debtors: canReadFinancials ? debtors : [],
    recentActivity,
  };
}

/* ------------------------------- reports ------------------------------- */

export type ReportsData = {
  currency: string;
  totalSales: number;
  totalProfit: number;
  totalTax: number;
  totalDiscount: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  series: { label: string; sales: number; profit: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
  slowProducts: { name: string; stock: number }[];
  topCustomers: { name: string; total: number; outstanding: number }[];
  paymentsByMethod: { method: string; amount: number }[];
  expensesByCategory: { category: string; amount: number }[];
  inventory: {
    costValue: number;
    retailValue: number;
    lowStockCount: number;
    productCount: number;
  };
};

export async function loadReports(
  supabase: Db,
  businessId: string,
  days: number,
): Promise<ReportsData> {
  await assertPermission(supabase, businessId, "reports.financial");
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - (days - 1));
  windowStart.setHours(0, 0, 0, 0);

  const [businessRes, salesRes, saleItemsRes, expensesRes, paymentsRes, productsRes, customersRes] =
    await Promise.all([
      supabase.from("businesses").select("currency").eq("id", businessId).maybeSingle(),
      supabase
        .from("sales")
        .select("customer_id, total, cost_total, tax, discount, created_at")
        .eq("business_id", businessId)
        .in("status", ["completed", "partially_refunded"])
        .gte("created_at", windowStart.toISOString()),
      // Safety net only (see the invoices query in loadDashboard for the
      // same tradeoff), the highest-cardinality table in the schema, one
      // row per line item per sale.
      supabase
        .from("sale_items")
        .select("product_id, name, quantity, line_total")
        .eq("business_id", businessId)
        .gte("created_at", windowStart.toISOString())
        .limit(20000),
      supabase
        .from("expenses")
        .select("category, amount")
        .eq("business_id", businessId)
        .gte("expense_date", dayKey(windowStart)),
      supabase
        .from("payments")
        .select("method, amount")
        .eq("business_id", businessId)
        .gte("paid_at", windowStart.toISOString()),
      supabase
        .from("products")
        .select("id, name, stock, min_stock, cost_price, selling_price")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .eq("is_active", true)
        .limit(1000),
      supabase
        .from("customers")
        .select("id, name, outstanding_balance")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .limit(1000),
    ]);

  const currency = businessRes.data?.currency ?? "USD";
  const sales = salesRes.data ?? [];
  const saleItems = saleItemsRes.data ?? [];
  const expenses = expensesRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const products = productsRes.data ?? [];
  const customers = customersRes.data ?? [];

  const buckets = new Map<string, { sales: number; profit: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    buckets.set(dayKey(d), { sales: 0, profit: 0 });
  }

  let totalSales = 0;
  let totalProfit = 0;
  let totalTax = 0;
  let totalDiscount = 0;
  const salesByCustomer = new Map<string, number>();

  for (const sale of sales) {
    const total = Number(sale.total ?? 0);
    const profit = total - Number(sale.cost_total ?? 0);
    totalSales += total;
    totalProfit += profit;
    totalTax += Number(sale.tax ?? 0);
    totalDiscount += Number(sale.discount ?? 0);
    const bucket = buckets.get(dayKey(new Date(sale.created_at)));
    if (bucket) {
      bucket.sales += total;
      bucket.profit += profit;
    }
    if (sale.customer_id) {
      salesByCustomer.set(sale.customer_id, (salesByCustomer.get(sale.customer_id) ?? 0) + total);
    }
  }

  const productSales = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const item of saleItems) {
    const key = item.product_id ?? item.name;
    const existing = productSales.get(key) ?? { name: item.name, quantity: 0, revenue: 0 };
    existing.quantity += Number(item.quantity ?? 0);
    existing.revenue += Number(item.line_total ?? 0);
    productSales.set(key, existing);
  }
  const topProducts = [...productSales.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  const soldProductIds = new Set(saleItems.map((item) => item.product_id).filter(Boolean));
  const slowProducts = products
    .filter((p) => Number(p.stock) > 0 && !soldProductIds.has(p.id))
    .sort((a, b) => Number(b.stock) - Number(a.stock))
    .slice(0, 8)
    .map((p) => ({ name: p.name, stock: Number(p.stock) }));

  const customerById = new Map(customers.map((c) => [c.id, c]));
  const topCustomers = [...salesByCustomer.entries()]
    .map(([customerId, total]) => {
      const customer = customerById.get(customerId);
      return {
        name: customer?.name ?? "Unknown customer",
        total,
        outstanding: Number(customer?.outstanding_balance ?? 0),
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const paymentsByMethodMap = new Map<string, number>();
  for (const payment of payments) {
    paymentsByMethodMap.set(
      payment.method,
      (paymentsByMethodMap.get(payment.method) ?? 0) + Number(payment.amount ?? 0),
    );
  }
  const paymentsByMethod = [...paymentsByMethodMap.entries()]
    .map(([method, amount]) => ({ method, amount }))
    .sort((a, b) => b.amount - a.amount);

  const expensesByCategoryMap = new Map<string, number>();
  for (const expense of expenses) {
    expensesByCategoryMap.set(
      expense.category,
      (expensesByCategoryMap.get(expense.category) ?? 0) + Number(expense.amount ?? 0),
    );
  }
  const expensesByCategory = [...expensesByCategoryMap.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount ?? 0), 0);

  const costValue = products.reduce((sum, p) => sum + Number(p.stock) * Number(p.cost_price), 0);
  const retailValue = products.reduce(
    (sum, p) => sum + Number(p.stock) * Number(p.selling_price),
    0,
  );
  const lowStockCount = products.filter((p) => Number(p.stock) <= Number(p.min_stock)).length;

  const netProfit = totalProfit - totalExpenses;
  const profitMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;

  return {
    currency,
    totalSales: round2(totalSales),
    totalProfit: round2(totalProfit),
    totalTax: round2(totalTax),
    totalDiscount: round2(totalDiscount),
    totalExpenses: round2(totalExpenses),
    netProfit: round2(netProfit),
    profitMargin: round2(profitMargin),
    series: [...buckets.entries()].map(([key, value]) => ({
      label: new Date(key).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      sales: round2(value.sales),
      profit: round2(value.profit),
    })),
    topProducts: topProducts.map((p) => ({ ...p, revenue: round2(p.revenue) })),
    slowProducts,
    topCustomers: topCustomers.map((c) => ({ ...c, total: round2(c.total) })),
    paymentsByMethod: paymentsByMethod.map((p) => ({ ...p, amount: round2(p.amount) })),
    expensesByCategory: expensesByCategory.map((e) => ({ ...e, amount: round2(e.amount) })),
    inventory: {
      costValue: round2(costValue),
      retailValue: round2(retailValue),
      lowStockCount,
      productCount: products.length,
    },
  };
}

function round2(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}
