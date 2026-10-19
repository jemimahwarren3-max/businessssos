import { AppError, assertMember, listCustomers, listProducts, type Db } from "./business.server";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "./business.schemas";
import { GroqProvider } from "./ai/groq-provider";
import type { ChatMessage } from "./ai/provider";
import { checkRateLimit } from "./rate-limit.server";

// Bounds cumulative Groq cost per business independent of how many staff
// share the per-minute bucket — same 24h-window primitive askAssistant uses.
const DAILY_LIMIT = 100;
const DAILY_WINDOW_SECONDS = 60 * 60 * 24;

const CATEGORY_VALUES = EXPENSE_CATEGORIES.map((c) => c.value);
const PAYMENT_VALUES = PAYMENT_METHODS.map((p) => p.value);

const SYSTEM_PROMPT = `You turn one short message from a small-business owner into structured data.
Output ONLY a single JSON object, no other text, matching exactly one of these shapes:

Sale: {"type":"sale","items":[{"name":"item name","quantity":1}],"customerName":"optional name or omit","paymentMethod":"optional, one of cash|card|mobile_money|bank_transfer|credit"}
Purchase: {"type":"purchase","productName":"item name","quantity":1,"unitCost":"optional number","supplierName":"optional"}
Expense: {"type":"expense","amount":0,"category":"optional, one of ${CATEGORY_VALUES.join("|")}","description":"optional","vendor":"optional"}
Customer: {"type":"customer","name":"required","phone":"optional","email":"optional"}
Unclear: {"type":"unknown"}

Rules:
- A sale is recording something already sold to a customer. A purchase is stock/goods the
  business bought in, to resell or restock, e.g. "Bought 20 cases of Mazoe from ABC Suppliers
  at $8 each". An expense is money paid out that isn't buying stock (rent, transport, etc).
- Never invent a name, amount, or quantity that isn't stated or clearly implied.
- If the message doesn't clearly match one of these, output {"type":"unknown"}.
- Quantity defaults to 1 if not stated. Output valid JSON only, no markdown, no commentary.`;

export type QuickEntryItem = {
  name: string;
  quantity: number;
  productId: string;
  unitPrice: number;
  taxRate: number;
};

export type QuickEntryDraft =
  | {
      type: "sale";
      items: QuickEntryItem[];
      customerId: string;
      customerName: string;
      paymentMethod: (typeof PAYMENT_VALUES)[number];
    }
  | {
      type: "purchase";
      productName: string;
      productId: string;
      quantity: number;
      unitCost: number;
      supplierName: string;
    }
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
  items?: { name?: unknown; quantity?: unknown }[];
  customerName?: unknown;
  paymentMethod?: unknown;
};
export type RawPurchase = {
  type: "purchase";
  productName?: unknown;
  quantity?: unknown;
  unitCost?: unknown;
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
type RawDraft = RawSale | RawPurchase | RawExpense | RawCustomer | RawUnknown;

export function isRawDraft(value: unknown): value is RawDraft {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === "sale" ||
    type === "purchase" ||
    type === "expense" ||
    type === "customer" ||
    type === "unknown"
  );
}

/** Groq's smaller instant models sometimes wrap JSON in a markdown code
 * fence or add a stray sentence despite the prompt saying not to — pull out
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

async function resolveSale(
  supabase: Db,
  businessId: string,
  raw: RawSale,
): Promise<QuickEntryDraft> {
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items: QuickEntryItem[] = [];
  for (const rawItem of rawItems) {
    const name = asString(rawItem?.name);
    if (!name) continue;
    const quantity = asNumber(rawItem?.quantity) || 1;
    const matches = await listProducts(supabase, businessId, name);
    const match = matches[0];
    items.push({
      name,
      quantity,
      productId: match?.id ?? "",
      unitPrice: match ? Number(match.selling_price) : 0,
      taxRate: match ? Number(match.tax_rate) : 0,
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

  return { type: "sale", items, customerId, customerName, paymentMethod };
}

async function resolvePurchase(
  supabase: Db,
  businessId: string,
  raw: RawPurchase,
): Promise<QuickEntryDraft> {
  const productName = asString(raw.productName);
  const quantity = asNumber(raw.quantity) || 1;
  if (!productName) return { type: "unknown" };

  const matches = await listProducts(supabase, businessId, productName);
  const match = matches[0];

  return {
    type: "purchase",
    productName,
    productId: match?.id ?? "",
    quantity,
    unitCost: asNumber(raw.unitCost),
    supplierName: asString(raw.supplierName),
  };
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

export async function parseQuickEntry(
  supabase: Db,
  businessId: string,
  text: string,
): Promise<QuickEntryDraft> {
  await assertMember(supabase, businessId);

  const withinDailyLimit = await checkRateLimit(
    `quick-entry-daily:business:${businessId}`,
    DAILY_LIMIT,
    DAILY_WINDOW_SECONDS,
  );
  if (!withinDailyLimit) {
    throw new AppError("Quick Add has reached its daily usage limit. Please try again tomorrow.");
  }

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: text },
  ];

  const provider = new GroqProvider();
  let raw: unknown;
  try {
    const content = await provider.chat(messages);
    raw = JSON.parse(extractJson(content));
  } catch (error) {
    if (error instanceof SyntaxError) return { type: "unknown" };
    console.error("[businessos] quick entry parse failed", error);
    throw new AppError("Quick Add isn't available right now. Please try again shortly.");
  }

  if (!isRawDraft(raw)) return { type: "unknown" };
  if (raw.type === "sale") return resolveSale(supabase, businessId, raw);
  if (raw.type === "purchase") return resolvePurchase(supabase, businessId, raw);
  if (raw.type === "expense") return resolveExpense(raw);
  if (raw.type === "customer") return resolveCustomer(raw);
  return { type: "unknown" };
}
