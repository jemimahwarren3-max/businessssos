import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { cacheDel, cacheGet, cacheSet, workspaceCacheKey } from "@/lib/cache/redis.server";
import { isBillingEnabled } from "@/lib/feature-flags.server";
import { flushNotificationOutboxForBusiness } from "@/lib/notifications.mail.server";
import type {
  ConvertQuoteInput,
  CreateBusinessInput,
  CustomerImportRow,
  CustomerInput,
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
  UpdateSupplierInput,
} from "./business.schemas";

export type Db = SupabaseClient<Database>;

/** Friendly errors only — never leak Postgres details to the browser. */
export class AppError extends Error {}

function fail(message: string): never {
  throw new AppError(message);
}

export function dbFail(context: string, error: unknown): never {
  console.error(`[businessos] ${context}`, error);
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message;
  if (code === "23505") fail("That value already exists. Please use a different one.");
  if (code === "42501") fail("You don't have permission to do that.");
  // B0001/B0002 are our own RPC validation/authorization errors — the message is
  // hand-written and safe to show, unlike raw Postgres/RLS error text.
  if ((code === "B0001" || code === "B0002") && message) fail(message);
  fail("Something went wrong saving your data. Please try again.");
}

export type Workspace = {
  business: {
    id: string;
    name: string;
    business_type: string;
    currency: string;
    onboarding_completed: boolean;
    logo_url: string | null;
  };
  role: string;
  permissions: string[];
  plan: string;
  planStatus: string;
  isReadOnly: boolean;
  billingEnabled: boolean;
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

/** The data-driven successor to assertRole — checks a permission key against
 * business_role_permissions (owner always passes) instead of a hardcoded
 * role array. RLS policies and RPC-embedded has_business_role checks
 * throughout the schema are a separate, lower-level layer this doesn't
 * replace — only application-layer call sites use this. */
export async function assertPermission(supabase: Db, businessId: string, permission: string) {
  const { data, error } = await supabase.rpc("has_permission", {
    _business_id: businessId,
    _permission: permission,
  });
  if (error) dbFail("permission check", error);
  if (!data) fail("Your role doesn't allow this action.");
}

const READ_ONLY_MESSAGE =
  "Your trial has ended. Upgrade to Pro to keep creating and editing, your existing data is still safe and visible.";

/** True if a subscription in this state is allowed to write — active, or
 * still inside an unexpired trial. Shared by assertCanWrite (server-side
 * enforcement) and loadWorkspace (so the UI can show a read-only banner).
 * Always true while BILLING_ENABLED=false (free beta) — the underlying
 * subscription/trial data keeps accumulating normally either way (see
 * create_business_with_owner), so re-enabling billing later doesn't need a
 * data migration, only flipping the flag back. */
function canWriteForSubscription(
  subscription: { status: string; trial_ends_at: string | null } | null,
) {
  if (!isBillingEnabled()) return true;
  if (!subscription) return true; // fail open — shouldn't happen post atomic business creation
  if (subscription.status === "active") return true;
  return Boolean(
    subscription.status === "trialing" &&
    subscription.trial_ends_at &&
    new Date(subscription.trial_ends_at) > new Date(),
  );
}

/** Gate for every write (create/update/delete) — read paths never call this. */
export async function assertCanWrite(supabase: Db, businessId: string) {
  const { data: subscription, error } = await supabase
    .from("subscriptions")
    .select("status, trial_ends_at")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) dbFail("check subscription status", error);
  if (!canWriteForSubscription(subscription)) fail(READ_ONLY_MESSAGE);
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
// in this app actually worth caching (see src/lib/cache/redis.server.ts —
// no-ops entirely if Upstash isn't configured, so this is safe to ship
// before you've set it up). Only the found-workspace case is cached, not
// "no workspace yet" (the mid-onboarding case) — that's rare enough that
// re-checking it every time costs nothing, and caching a null would need
// extra bookkeeping to tell apart from a genuine cache miss.
export async function loadWorkspace(supabase: Db, userId: string): Promise<Workspace | null> {
  const cacheKey = workspaceCacheKey(userId);
  const cached = await cacheGet<Workspace>(cacheKey);
  if (cached) return cached;

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

  const [{ data: business, error: bizError }, { data: subscription }, { data: permissions }] =
    await Promise.all([
      supabase
        .from("businesses")
        .select("id, name, business_type, currency, onboarding_completed, logo_url")
        .eq("id", membership.business_id)
        .maybeSingle(),
      supabase
        .from("subscriptions")
        .select("plan, status, trial_ends_at")
        .eq("business_id", membership.business_id)
        .maybeSingle(),
      // Every member's own effective permission set — owner gets everything,
      // everyone else gets exactly what business_role_permissions grants
      // their role, defaulted to today's behavior on first access.
      supabase.rpc("get_my_permissions", { _business_id: membership.business_id }),
    ]);
  if (bizError) dbFail("load business", bizError);
  if (!business) return null;

  const workspace: Workspace = {
    business,
    role: membership.role,
    permissions: permissions ?? [],
    plan: subscription?.plan ?? "free",
    planStatus: subscription?.status ?? "trialing",
    isReadOnly: !canWriteForSubscription(subscription ?? null),
    billingEnabled: isBillingEnabled(),
  };
  await cacheSet(cacheKey, workspace, 60);
  return workspace;
}

/** Call after anything that changes a business's plan/status or a member's
 * role — every active member's cached workspace needs to reflect it, not
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
  const existing = await loadWorkspace(supabase, userId);
  if (existing) return existing.business.id;

  const { data: businessId, error } = await supabase.rpc("create_business_with_owner", {
    _name: input.name,
    _business_type: input.businessType,
    _currency: input.currency,
    _phone: input.phone ?? "",
    _address: input.address ?? "",
  });
  if (error || !businessId) dbFail("create business", error);

  // Best-effort — the business itself is already fully committed above, so a
  // failure here shouldn't roll anything back or block the user.
  await supabase.from("notifications").insert({
    business_id: businessId,
    user_id: userId,
    type: "welcome",
    title: "Welcome to BusinessOS AI",
    message: isBillingEnabled()
      ? "Your 3-day Pro trial has started. Add your first products to begin."
      : "You're in! BusinessOS is free during our beta, add your first products to begin.",
    severity: "info",
  });
  await recordAudit(supabase, {
    businessId,
    userId,
    action: "business.created",
    entityType: "business",
    entityId: businessId,
    summary: `Created business ${input.name}`,
  });

  return businessId;
}

/* -------------------------------- billing -------------------------------- */

export async function loadBillingSummary(supabase: Db, businessId: string) {
  await assertMember(supabase, businessId);

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

  return { subscription: subscription ?? null, payments: payments ?? [] };
}

/* ------------------------------- products ------------------------------- */

export async function listProducts(
  supabase: Db,
  businessId: string,
  search: string,
  supplierId?: string,
) {
  await assertMember(supabase, businessId);
  let query = supabase
    .from("products")
    .select(
      "id, name, sku, barcode, unit, cost_price, selling_price, stock, min_stock, tax_rate, is_active, updated_at, supplier_id",
    )
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  const term = search.trim();
  if (term) query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`);
  if (supplierId) query = query.eq("supplier_id", supplierId);
  const { data, error } = await query;
  if (error) dbFail("list products", error);
  return data ?? [];
}

export async function listLocations(supabase: Db, businessId: string) {
  await assertMember(supabase, businessId);
  const { data, error } = await supabase
    .from("locations")
    .select("id, name, address, phone, is_active, is_default")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name");
  if (error) dbFail("list locations", error);
  return data ?? [];
}

export async function createProduct(supabase: Db, input: ProductInput) {
  await assertCanWrite(supabase, input.businessId);
  const { data, error } = await supabase
    .rpc("create_product", {
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
    })
    .single();
  if (error || !data) dbFail("create product", error);
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
    const { data, error } = await supabase
      .from("products")
      .insert({
        business_id: input.businessId,
        name: row.name,
        sku: row.sku || null,
        barcode: row.barcode || null,
        unit: row.unit,
        cost_price: row.costPrice,
        selling_price: row.sellingPrice,
        stock: row.stock,
        min_stock: row.minStock,
        tax_rate: row.taxRate,
      })
      .select("id")
      .single();
    if (error || !data) {
      const reason =
        (error as { code?: string } | null)?.code === "23505"
          ? "duplicate SKU"
          : "couldn't be saved";
      errors.push(`Row ${index + 2}: ${row.name || "unnamed product"}, ${reason}`);
      continue;
    }
    if (row.stock > 0) {
      await supabase.from("inventory_movements").insert({
        business_id: input.businessId,
        product_id: data.id,
        movement_type: "stock_in",
        quantity: row.stock,
        stock_before: 0,
        stock_after: row.stock,
        reason: "Imported from spreadsheet",
        created_by: userId,
      });
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
  await assertMember(supabase, businessId);
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
  return data ?? [];
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
  await assertCanWrite(supabase, input.businessId);
  const { data, error } = await supabase.rpc("create_sale", {
    _business_id: input.businessId,
    _customer_id: (input.customerId || null) as never,
    _discount: input.discount,
    _payment_method: input.paymentMethod,
    _notes: (input.notes || null) as never,
    _items: input.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })) as never,
    _idempotency_key: input.idempotencyKey,
  });
  if (error) dbFail("create sale", error);
  await flushNotificationOutboxForBusiness(supabase, input.businessId);
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
  await assertMember(supabase, businessId);
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
  await assertMember(supabase, businessId);
  const [saleRes, itemsRes, refundsRes] = await Promise.all([
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
    // sale_refund does) — going through sale_refunds here is the only way
    // to scope this to one sale rather than pulling every refund in the
    // business.
    supabase
      .from("sale_refunds")
      .select("id, reason, total, created_at, sale_refund_items(sale_item_id, quantity)")
      .eq("sale_id", saleId)
      .eq("business_id", businessId)
      .order("created_at", { ascending: false }),
  ]);
  if (saleRes.error) dbFail("load sale", saleRes.error);
  if (!saleRes.data) fail("That sale could not be found.");
  if (itemsRes.error) dbFail("load sale items", itemsRes.error);
  if (refundsRes.error) dbFail("load sale refunds", refundsRes.error);

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
  await assertMember(supabase, businessId);
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
  await assertMember(supabase, businessId);
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
  await assertMember(supabase, businessId);
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
  await assertMember(supabase, businessId);
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
  await assertMember(supabase, businessId);
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
  await assertMember(supabase, businessId);
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

/** Receiving isn't just a label flip — set_purchase_order_status also adds a
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
  await assertMember(supabase, businessId);
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

/** Historical sales entered for reporting only — deliberately does NOT touch
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

/** Real line-item historical sales — one row = one product = one sale.
 * Resolves product/customer names against this business's own records
 * (same deterministic substring search Inventory/Customers search already
 * use) before calling import_sale_line, which decrements stock and writes
 * every timestamp as the row's own date rather than "now". Kept as its own
 * RPC rather than a create_sale parameter — see import_sale_line's own
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

export type DashboardData = {
  currency: string;
  todaySales: number;
  todayProfit: number;
  salesChange: number;
  profitChange: number;
  outstanding: number;
  outstandingCustomers: number;
  lowStockCount: number;
  urgentStockCount: number;
  series: { label: string; sales: number; profit: number }[];
  health: { score: number; label: string; signals: { tone: string; text: string }[] };
  lowStock: { id: string; name: string; stock: number; min_stock: number; unit: string }[];
};

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function loadDashboard(
  supabase: Db,
  businessId: string,
  days: number,
): Promise<DashboardData> {
  await assertMember(supabase, businessId);

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - (days * 2 - 1));
  windowStart.setHours(0, 0, 0, 0);

  const [businessRes, salesRes, invoiceRes, productRes, expenseRes] = await Promise.all([
    supabase.from("businesses").select("currency").eq("id", businessId).maybeSingle(),
    supabase
      .from("sales")
      .select("total, cost_total, discount, created_at")
      .eq("business_id", businessId)
      // partially_refunded sales still contribute their (already-reduced)
      // remaining total — only fully refunded/cancelled sales are excluded.
      .in("status", ["completed", "partially_refunded"])
      .gte("created_at", windowStart.toISOString()),
    // No date filter is possible here by design — an unpaid invoice from
    // last year is still "outstanding" today — so .limit() is the only
    // available bound. Safety net only: a business that somehow exceeds it
    // would see an understated outstanding total, not an error, but this is
    // far beyond realistic usage for this app's target market.
    supabase
      .from("invoices")
      .select("customer_id, total, amount_paid, status, due_date")
      .eq("business_id", businessId)
      .in("status", ["sent", "partially_paid", "overdue"])
      .limit(2000),
    supabase
      .from("products")
      .select("id, name, stock, min_stock, unit")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .eq("is_active", true)
      .limit(500),
    supabase
      .from("expenses")
      .select("amount, expense_date")
      .eq("business_id", businessId)
      .gte("expense_date", dayKey(windowStart)),
  ]);

  const currency = businessRes.data?.currency ?? "USD";
  const sales = salesRes.data ?? [];
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
    const total = Number(sale.total ?? 0);
    const profit = total - Number(sale.cost_total ?? 0);
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

  const outstanding = invoices.reduce(
    (sum, inv) => sum + Math.max(Number(inv.total ?? 0) - Number(inv.amount_paid ?? 0), 0),
    0,
  );
  const outstandingCustomers = new Set(invoices.map((inv) => inv.customer_id).filter(Boolean)).size;
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
  } else if (outstanding > 0) {
    signals.push({ tone: "info", text: "All invoices are still within terms" });
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
    todaySales: today.sales,
    todayProfit: today.profit,
    salesChange,
    profitChange,
    outstanding,
    outstandingCustomers,
    lowStockCount,
    urgentStockCount,
    series: [...buckets.entries()].map(([key, value]) => ({
      label: new Date(key).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      sales: Math.round(value.sales * 100) / 100,
      profit: Math.round(value.profit * 100) / 100,
    })),
    health: { score, label, signals: signals.slice(0, 6) },
    lowStock: lowStock.map((p) => ({
      id: p.id,
      name: p.name,
      stock: Number(p.stock),
      min_stock: Number(p.min_stock),
      unit: p.unit,
    })),
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
  await assertMember(supabase, businessId);

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
      // same tradeoff) — the highest-cardinality table in the schema, one
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
