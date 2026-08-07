import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  ConvertQuoteInput,
  CreateBusinessInput,
  CustomerInput,
  ExpenseImportRow,
  ExpenseInput,
  InvoiceInput,
  InvoiceStatusInput,
  LineItemInput,
  PaymentInput,
  ProductImportRow,
  ProductInput,
  QuoteInput,
  QuoteStatusInput,
  SaleHistoryImportRow,
  SaleInput,
  StockAdjustInput,
} from "./business.schemas";

export type Db = SupabaseClient<Database>;

/** Friendly errors only — never leak Postgres details to the browser. */
export class AppError extends Error {}

function fail(message: string): never {
  throw new AppError(message);
}

function dbFail(context: string, error: unknown): never {
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
  plan: string;
  planStatus: string;
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

export async function loadWorkspace(supabase: Db, userId: string): Promise<Workspace | null> {
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

  const [{ data: business, error: bizError }, { data: subscription }] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, name, business_type, currency, onboarding_completed, logo_url")
      .eq("id", membership.business_id)
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select("plan, status")
      .eq("business_id", membership.business_id)
      .maybeSingle(),
  ]);
  if (bizError) dbFail("load business", bizError);
  if (!business) return null;

  return {
    business,
    role: membership.role,
    plan: subscription?.plan ?? "free",
    planStatus: subscription?.status ?? "trialing",
  };
}

export async function createBusinessRecord(
  supabase: Db,
  userId: string,
  input: CreateBusinessInput,
) {
  const existing = await loadWorkspace(supabase, userId);
  if (existing) return existing.business.id;

  const { data: business, error } = await supabase
    .from("businesses")
    .insert({
      name: input.name,
      business_type: input.businessType,
      currency: input.currency,
      phone: input.phone || null,
      address: input.address || null,
      created_by: userId,
      onboarding_completed: true,
    })
    .select("id")
    .single();
  if (error || !business) dbFail("create business", error);

  const { error: memberError } = await supabase.from("business_members").insert({
    business_id: business.id,
    user_id: userId,
    role: "owner",
  });
  if (memberError) dbFail("create owner membership", memberError);

  const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("business_settings").insert({ business_id: business.id });
  await supabase.from("subscriptions").insert({
    business_id: business.id,
    plan: "business",
    status: "trialing",
    trial_ends_at: trialEnd,
    current_period_start: new Date().toISOString(),
    current_period_end: trialEnd,
  });
  await supabase.from("notifications").insert({
    business_id: business.id,
    user_id: userId,
    type: "welcome",
    title: "Welcome to BusinessOS AI",
    message: "Your 14-day Business trial has started. Add your first products to begin.",
    severity: "info",
  });
  await recordAudit(supabase, {
    businessId: business.id,
    userId,
    action: "business.created",
    entityType: "business",
    entityId: business.id,
    summary: `Created business ${input.name}`,
  });

  return business.id;
}

/* ------------------------------- products ------------------------------- */

export async function listProducts(supabase: Db, businessId: string, search: string) {
  await assertMember(supabase, businessId);
  let query = supabase
    .from("products")
    .select(
      "id, name, sku, barcode, unit, cost_price, selling_price, stock, min_stock, tax_rate, is_active, updated_at",
    )
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  const term = search.trim();
  if (term) query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) dbFail("list products", error);
  return data ?? [];
}

export async function createProduct(supabase: Db, userId: string, input: ProductInput) {
  await assertRole(supabase, input.businessId, ["owner", "admin", "manager"]);
  if (input.sellingPrice < input.costPrice) {
    // allowed, but worth surfacing later as an insight — not an error.
  }
  const { data, error } = await supabase
    .from("products")
    .insert({
      business_id: input.businessId,
      name: input.name,
      sku: input.sku || null,
      barcode: input.barcode || null,
      unit: input.unit,
      cost_price: input.costPrice,
      selling_price: input.sellingPrice,
      stock: input.stock,
      min_stock: input.minStock,
      tax_rate: input.taxRate,
      description: input.description || null,
    })
    .select("id, name, stock")
    .single();
  if (error || !data) dbFail("create product", error);

  if (input.stock > 0) {
    await supabase.from("inventory_movements").insert({
      business_id: input.businessId,
      product_id: data.id,
      movement_type: "stock_in",
      quantity: input.stock,
      stock_before: 0,
      stock_after: input.stock,
      reason: "Opening stock",
      created_by: userId,
    });
  }
  await recordAudit(supabase, {
    businessId: input.businessId,
    userId,
    action: "product.created",
    entityType: "product",
    entityId: data.id,
    summary: `Added product ${data.name}`,
    newValues: { name: input.name, selling_price: input.sellingPrice, stock: input.stock },
  });
  return data;
}

export type ImportResult = { imported: number; skipped: number; errors: string[] };

export async function importProducts(
  supabase: Db,
  userId: string,
  input: { businessId: string; rows: ProductImportRow[] },
): Promise<ImportResult> {
  await assertRole(supabase, input.businessId, ["owner", "admin", "manager"]);
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
      errors.push(`Row ${index + 2}: ${row.name || "unnamed product"} — ${reason}`);
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

export async function adjustStock(supabase: Db, userId: string, input: StockAdjustInput) {
  await assertRole(supabase, input.businessId, ["owner", "admin", "manager"]);
  const { data: product, error } = await supabase
    .from("products")
    .select("id, name, stock")
    .eq("id", input.productId)
    .eq("business_id", input.businessId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) dbFail("load product", error);
  if (!product) fail("That product could not be found.");

  const signed = input.movementType === "stock_out" ? -input.quantity : input.quantity;
  const before = Number(product.stock);
  const after = before + signed;

  const { data: settings } = await supabase
    .from("business_settings")
    .select("allow_negative_stock")
    .eq("business_id", input.businessId)
    .maybeSingle();
  if (after < 0 && !settings?.allow_negative_stock) {
    fail(`Not enough stock. ${product.name} only has ${before} left.`);
  }

  const { error: updateError } = await supabase
    .from("products")
    .update({ stock: after })
    .eq("id", product.id)
    .eq("business_id", input.businessId);
  if (updateError) dbFail("update stock", updateError);

  const { error: movementError } = await supabase.from("inventory_movements").insert({
    business_id: input.businessId,
    product_id: product.id,
    movement_type: input.movementType,
    quantity: signed,
    stock_before: before,
    stock_after: after,
    reason: input.reason || null,
    created_by: userId,
  });
  if (movementError) dbFail("record movement", movementError);

  await recordAudit(supabase, {
    businessId: input.businessId,
    userId,
    action: "inventory.adjusted",
    entityType: "product",
    entityId: product.id,
    summary: `${product.name}: stock ${before} → ${after}`,
    oldValues: { stock: before },
    newValues: { stock: after, movement: input.movementType },
  });
  return { stock: after };
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
  await assertRole(supabase, input.businessId, [
    "owner",
    "admin",
    "manager",
    "cashier",
    "accountant",
  ]);
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

/* --------------------------------- sales --------------------------------- */

export async function createSale(supabase: Db, input: SaleInput) {
  const { data, error } = await supabase.rpc("create_sale", {
    _business_id: input.businessId,
    _customer_id: input.customerId || null,
    _discount: input.discount,
    _payment_method: input.paymentMethod,
    _notes: input.notes || null,
    _items: input.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })) as never,
    _idempotency_key: input.idempotencyKey,
  });
  if (error) dbFail("create sale", error);
  return { id: data as string };
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
      .select("*, customers(name, phone, email)")
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
  const { data, error } = await supabase.rpc("create_invoice", {
    _business_id: input.businessId,
    _customer_id: input.customerId || null,
    _issue_date: input.issueDate,
    _due_date: input.dueDate || null,
    _notes: input.notes || null,
    _terms: input.terms || null,
    _discount: input.discount,
    _items: toItemsPayload(input.items),
    _idempotency_key: input.idempotencyKey,
  });
  if (error) dbFail("create invoice", error);
  return { id: data as string };
}

export async function setInvoiceStatus(supabase: Db, input: InvoiceStatusInput) {
  const { error } = await supabase.rpc("set_invoice_status", {
    _business_id: input.businessId,
    _invoice_id: input.invoiceId,
    _status: input.status,
  });
  if (error) dbFail("update invoice status", error);
  return { ok: true };
}

export async function recordInvoicePayment(supabase: Db, input: PaymentInput) {
  const { data, error } = await supabase.rpc("record_invoice_payment", {
    _business_id: input.businessId,
    _invoice_id: input.invoiceId,
    _amount: input.amount,
    _method: input.method,
    _reference: input.reference || null,
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
      .select("*, customers(name, phone, email)")
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
  const { data, error } = await supabase.rpc("create_quote", {
    _business_id: input.businessId,
    _customer_id: input.customerId || null,
    _issue_date: input.issueDate,
    _valid_until: input.validUntil || null,
    _notes: input.notes || null,
    _terms: input.terms || null,
    _discount: input.discount,
    _items: toItemsPayload(input.items),
  });
  if (error) dbFail("create quote", error);
  return { id: data as string };
}

export async function setQuoteStatus(supabase: Db, userId: string, input: QuoteStatusInput) {
  await assertRole(supabase, input.businessId, ["owner", "admin", "manager", "accountant"]);
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
  const { data, error } = await supabase.rpc("convert_quote_to_invoice", {
    _business_id: input.businessId,
    _quote_id: input.quoteId,
    _due_date: input.dueDate || null,
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
  await assertRole(supabase, input.businessId, ["owner", "admin", "manager", "accountant"]);
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
  await assertRole(supabase, businessId, ["owner", "admin"]);
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
  await assertRole(supabase, input.businessId, ["owner", "admin", "manager", "accountant"]);
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
      errors.push(`Row ${index + 2}: ${row.expenseDate} — couldn't be saved`);
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
  await assertRole(supabase, input.businessId, ["owner", "admin", "manager", "accountant"]);
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
      _description: row.description || null,
    });
    if (error) {
      errors.push(`Row ${index + 2}: ${row.saleDate} — couldn't be saved`);
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
      .eq("status", "completed")
      .gte("created_at", windowStart.toISOString()),
    supabase
      .from("invoices")
      .select("customer_id, total, amount_paid, status, due_date")
      .eq("business_id", businessId)
      .in("status", ["sent", "partially_paid", "overdue"]),
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
        .eq("status", "completed")
        .gte("created_at", windowStart.toISOString()),
      supabase
        .from("sale_items")
        .select("product_id, name, quantity, line_total")
        .eq("business_id", businessId)
        .gte("created_at", windowStart.toISOString()),
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
