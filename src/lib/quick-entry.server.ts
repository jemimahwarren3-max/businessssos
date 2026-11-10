import { AppError, listCustomers, listProducts, type Db } from "./business.server";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "./business.schemas";
import { getAIProvider } from "./ai/get-provider.server";
import type { ChatMessage } from "./ai/provider";
import { AI_LIMITS } from "./ai/limits.server";
import { checkRateLimit } from "./rate-limit.server";
import { pickBestProductMatch } from "./quick-entry-product-match";

const CATEGORY_VALUES = EXPENSE_CATEGORIES.map((c) => c.value);
const PAYMENT_VALUES = PAYMENT_METHODS.map((p) => p.value);

function buildSystemPrompt(catalogNames: string[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const catalogBlock =
    catalogNames.length > 0
      ? `\nProducts in this shop (map casual descriptions to the closest name when you can): ${catalogNames.slice(0, 120).join("; ")}`
      : "";
  return `You turn a shop owner's short note (and optional pasted spreadsheet rows) into structured data.
Output ONLY a single JSON object, no other text, matching exactly one of these shapes:

Sale: {"type":"sale","items":[{"name":"item label","quantity":1,"unitPrice":"optional number"}],"customerName":"optional","customerPhone":"optional","paymentMethod":"optional cash|card|mobile_money|bank_transfer|credit","saleDate":"optional YYYY-MM-DD"}
Sale batch: {"type":"sale_batch","sales":[{same fields as one sale per row/group}],"contextDate":"optional YYYY-MM-DD when user says a date for the whole file"}
Purchase: {"type":"purchase","productName":"best label","quantity":1,"unitCost":"optional number","supplierName":"optional"}
Purchase batch: {"type":"purchase_batch","purchases":[{same fields as one purchase per stock line}],"supplierName":"optional shared supplier"}
Expense: {"type":"expense","amount":0,"category":"optional ${CATEGORY_VALUES.join("|")}","description":"optional","vendor":"optional"}
Customer: {"type":"customer","name":"required","phone":"optional","email":"optional"}
Unclear: {"type":"unknown"}

Rules:
- Understand intent, not only formal product names. "Orange drink", "those 2L juices", "the blue soap" are valid productName values; pick the closest catalogue name when listed below.
- A sale is goods already sold to someone. A purchase is stock bought in or stock received. An expense is money out that is not stock.
- Restock, delivery, goods received, stock take additions, bought from supplier → purchase or purchase_batch, not sale.
- Tables with SOH, stock, qty received, cost, supplier, delivery and no customer → purchase_batch (one purchase per row).
- If the user says something like "sales 9 November" or "9 Nov sales", set saleDate or contextDate using year ${today.slice(0, 4)} unless another year is stated.
- When tabular lines look like sales (customer, product, qty, price, date), use sale_batch.
- Spreadsheet headers may use any common labels (Item, Product, Qty, SOH, Stock, Client, Amount, Date, Unit Price, RSP, Received). Read Column=value pairs literally.
- Every sale or purchase line needs a productName: use description, SKU column, or row context when the Name column is empty. Never drop a row only because Name is blank.
- Do not invent quantities or prices not implied by the message. You may infer a sensible productName label from context.
- Never invent customer names. If a name appears on a sale line, include customerName even when unknown in the system.
- Prefer purchase_batch over unknown when multiple stock lines are clearly restock.
- Quantity defaults to 1. Output valid JSON only, no markdown.${catalogBlock}`;
}

export type QuickEntryItem = {
  name: string;
  quantity: number;
  productId: string;
  unitPrice: number;
  taxRate: number;
  availableStock: number;
  stockOk: boolean;
};

export type QuickEntrySaleDraft = {
  type: "sale";
  items: QuickEntryItem[];
  customerId: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: (typeof PAYMENT_VALUES)[number];
  saleDate: string;
};

export type QuickEntryPurchaseDraft = {
  type: "purchase";
  productName: string;
  productId: string;
  quantity: number;
  unitCost: number;
  supplierName: string;
};

export type QuickEntryDraft =
  | QuickEntrySaleDraft
  | { type: "sale_batch"; sales: QuickEntrySaleDraft[] }
  | QuickEntryPurchaseDraft
  | { type: "purchase_batch"; purchases: QuickEntryPurchaseDraft[] }
  | {
      type: "expense";
      amount: number;
      category: (typeof CATEGORY_VALUES)[number];
      description: string;
      vendor: string;
    }
  | { type: "customer"; name: string; phone: string; email: string }
  | { type: "unknown" };

export type RawSale = {
  type: "sale";
  items?: { name?: unknown; quantity?: unknown; unitPrice?: unknown }[];
  customerName?: unknown;
  customerPhone?: unknown;
  paymentMethod?: unknown;
  saleDate?: unknown;
};
export type RawSaleBatch = {
  type: "sale_batch";
  sales?: RawSale[];
  contextDate?: unknown;
};
export type RawPurchase = {
  type: "purchase";
  productName?: unknown;
  quantity?: unknown;
  unitCost?: unknown;
  supplierName?: unknown;
};
export type RawPurchaseBatch = {
  type: "purchase_batch";
  purchases?: RawPurchase[];
  supplierName?: unknown;
};
export type RawExpense = {
  type: "expense";
  amount?: unknown;
  category?: unknown;
  description?: unknown;
  vendor?: unknown;
};
export type RawCustomer = { type: "customer"; name?: unknown; phone?: unknown; email?: unknown };
type RawUnknown = { type: "unknown" };
type RawDraft =
  RawSale | RawSaleBatch | RawPurchase | RawPurchaseBatch | RawExpense | RawCustomer | RawUnknown;

export function isRawDraft(value: unknown): value is RawDraft {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === "sale" ||
    type === "sale_batch" ||
    type === "purchase" ||
    type === "purchase_batch" ||
    type === "expense" ||
    type === "customer" ||
    type === "unknown"
  );
}

type ProductRow = Awaited<ReturnType<typeof listProducts>>[number];

async function findProductForHint(
  supabase: Db,
  businessId: string,
  hint: string,
): Promise<ProductRow | undefined> {
  const trimmed = hint.trim();
  if (!trimmed) return undefined;
  const narrow = await listProducts(supabase, businessId, trimmed, undefined, 50);
  const bestNarrow = pickBestProductMatch(trimmed, narrow);
  if (bestNarrow) return narrow.find((row) => row.id === bestNarrow.id);
  const catalog = await listProducts(supabase, businessId, "", undefined, 400);
  const best = pickBestProductMatch(trimmed, catalog);
  if (!best) return undefined;
  return catalog.find((row) => row.id === best.id);
}

/** Some models wrap JSON in a markdown code
 * fence or add a stray sentence despite the prompt saying not to, pull out
 * just the outermost {...} block before parsing so that doesn't turn a
 * correctly-understood message into a false "unknown". */
export function extractJson(content: string): string {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return content;
  return content.slice(start, end + 1);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function asOptionalPrice(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function asSaleDate(value: unknown, fallback: string): string {
  const text = asString(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return fallback;
}

async function resolveSale(
  supabase: Db,
  businessId: string,
  raw: RawSale,
  defaultSaleDate = "",
): Promise<QuickEntrySaleDraft | { type: "unknown" }> {
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items: QuickEntryItem[] = [];
  for (const rawItem of rawItems) {
    const name = asString(rawItem?.name);
    if (!name) continue;
    const quantity = asNumber(rawItem?.quantity) || 1;
    const match = await findProductForHint(supabase, businessId, name);
    const availableStock = match ? Number(match.stock) : 0;
    const unitPrice = match
      ? asOptionalPrice(rawItem?.unitPrice, Number(match.selling_price))
      : asOptionalPrice(rawItem?.unitPrice, 0);
    items.push({
      name,
      quantity,
      productId: match?.id ?? "",
      unitPrice,
      taxRate: match ? Number(match.tax_rate) : 0,
      availableStock,
      stockOk: Boolean(match?.id) && quantity <= availableStock,
    });
  }
  if (items.length === 0) return { type: "unknown" };

  const customerName = asString(raw.customerName);
  let customerId = "";
  if (customerName) {
    const matches = await listCustomers(supabase, businessId, customerName);
    customerId = matches[0]?.id ?? "";
  }

  const paymentMethod = PAYMENT_VALUES.includes(asString(raw.paymentMethod) as never)
    ? (asString(raw.paymentMethod) as (typeof PAYMENT_VALUES)[number])
    : "cash";

  const saleDate = asSaleDate(raw.saleDate, defaultSaleDate);

  return {
    type: "sale",
    items,
    customerId,
    customerName,
    customerPhone: asString(raw.customerPhone),
    paymentMethod,
    saleDate,
  };
}

async function resolveSaleBatch(
  supabase: Db,
  businessId: string,
  raw: RawSaleBatch,
): Promise<QuickEntryDraft> {
  const contextDate = asSaleDate(raw.contextDate, "");
  const rawSales = Array.isArray(raw.sales) ? raw.sales : [];
  const sales: QuickEntrySaleDraft[] = [];
  for (const entry of rawSales) {
    const resolved = await resolveSale(
      supabase,
      businessId,
      { ...entry, type: "sale" },
      contextDate,
    );
    if (resolved.type === "sale") sales.push(resolved);
  }
  if (sales.length === 0) return { type: "unknown" };
  if (sales.length === 1) return sales[0]!;
  return { type: "sale_batch", sales };
}

async function resolvePurchase(
  supabase: Db,
  businessId: string,
  raw: RawPurchase,
  sharedSupplier = "",
): Promise<QuickEntryPurchaseDraft | { type: "unknown" }> {
  const productName = asString(raw.productName);
  const quantity = asNumber(raw.quantity) || 1;
  if (!productName) return { type: "unknown" };

  const match = await findProductForHint(supabase, businessId, productName);
  const supplierName = asString(raw.supplierName) || sharedSupplier;

  return {
    type: "purchase",
    productName: match?.name ?? productName,
    productId: match?.id ?? "",
    quantity,
    unitCost: asNumber(raw.unitCost),
    supplierName,
  };
}

async function resolvePurchaseBatch(
  supabase: Db,
  businessId: string,
  raw: RawPurchaseBatch,
): Promise<QuickEntryDraft> {
  const sharedSupplier = asString(raw.supplierName);
  const rawPurchases = Array.isArray(raw.purchases) ? raw.purchases : [];
  const purchases: QuickEntryPurchaseDraft[] = [];
  for (const entry of rawPurchases) {
    const resolved = await resolvePurchase(supabase, businessId, entry, sharedSupplier);
    if (resolved.type === "purchase") purchases.push(resolved);
  }
  if (purchases.length === 0) return { type: "unknown" };
  if (purchases.length === 1) return purchases[0]!;
  return { type: "purchase_batch", purchases };
}

export function resolveExpense(raw: RawExpense): QuickEntryDraft {
  const amount = asNumber(raw.amount);
  if (!amount) return { type: "unknown" };
  const category = CATEGORY_VALUES.includes(asString(raw.category) as never)
    ? (asString(raw.category) as (typeof CATEGORY_VALUES)[number])
    : "other";
  return {
    type: "expense",
    amount,
    category,
    description: asString(raw.description),
    vendor: asString(raw.vendor),
  };
}

export function resolveCustomer(raw: RawCustomer): QuickEntryDraft {
  const name = asString(raw.name);
  if (!name) return { type: "unknown" };
  return { type: "customer", name, phone: asString(raw.phone), email: asString(raw.email) };
}

export function quickEntrySaleIsStockOk(sale: QuickEntrySaleDraft): boolean {
  return sale.items.length > 0 && sale.items.every((item) => item.stockOk);
}

export function quickEntrySaleHasProducts(sale: QuickEntrySaleDraft): boolean {
  return sale.items.length > 0 && sale.items.every((item) => Boolean(item.productId));
}

/** Human-readable blocker before calling create_sale (stock is still enforced on the server). */
export function quickEntrySaleFailureReason(sale: QuickEntrySaleDraft): string | null {
  if (sale.items.length === 0) return "No items on this sale.";
  const unmatched = sale.items.filter((item) => !item.productId);
  if (unmatched.length > 0) {
    const names = unmatched.map((item) => item.name).filter(Boolean);
    return names.length
      ? `Pick a product for: ${names.join(", ")} in the list below, or add them in Inventory.`
      : "One or more lines need a product from your catalogue.";
  }
  const overStock = sale.items.filter((item) => !item.stockOk);
  if (overStock.length > 0) {
    return overStock
      .map(
        (item) => `${item.name}: selling ${item.quantity} but only ${item.availableStock} in stock`,
      )
      .join("; ");
  }
  return null;
}

export function quickEntryPurchaseFailureReason(
  purchase: Pick<QuickEntryPurchaseDraft, "productName" | "productId" | "quantity">,
): string | null {
  if (purchase.quantity <= 0) return "Quantity must be at least 1.";
  if (!purchase.productId && !purchase.productName.trim()) {
    return "Name what you received so we can match or create the product.";
  }
  return null;
}

export async function parseQuickEntry(
  supabase: Db,
  businessId: string,
  text: string,
): Promise<QuickEntryDraft> {
  const withinDailyLimit = await checkRateLimit(
    `quick-entry-daily:business:${businessId}`,
    AI_LIMITS.quickEntryDaily,
    AI_LIMITS.dayWindowSeconds,
  );
  if (!withinDailyLimit) {
    throw new AppError("Quick Add has reached its daily usage limit. Please try again tomorrow.");
  }

  const catalog = await listProducts(supabase, businessId, "", undefined, 120);
  const catalogNames = catalog.map((row) => row.name);

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(catalogNames) },
    { role: "user", content: text },
  ];

  let raw: unknown;
  try {
    const content = await getAIProvider().chat(messages);
    raw = JSON.parse(extractJson(content));
  } catch (error) {
    if (error instanceof SyntaxError) return { type: "unknown" };
    console.error("[businessos] quick entry parse failed", error);
    throw new AppError("Quick Add isn't available right now. Please try again shortly.");
  }

  if (!isRawDraft(raw)) return { type: "unknown" };
  if (raw.type === "sale") {
    const sale = await resolveSale(supabase, businessId, raw);
    return sale.type === "unknown" ? sale : sale;
  }
  if (raw.type === "sale_batch") return resolveSaleBatch(supabase, businessId, raw);
  if (raw.type === "purchase") {
    const purchase = await resolvePurchase(supabase, businessId, raw);
    return purchase.type === "unknown" ? purchase : purchase;
  }
  if (raw.type === "purchase_batch") return resolvePurchaseBatch(supabase, businessId, raw);
  if (raw.type === "expense") return resolveExpense(raw);
  if (raw.type === "customer") return resolveCustomer(raw);
  return { type: "unknown" };
}
