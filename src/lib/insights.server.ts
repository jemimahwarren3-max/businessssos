import { AppError, assertPermission, type Db } from "./business.server";
import { cacheGet, cacheSet } from "@/lib/cache/redis.server";
import { getAIProvider } from "./ai/get-provider.server";
import type { ChatMessage } from "./ai/provider";
import { buildBusinessSummary } from "./ai.server";
import { formatMoney } from "./format";
import { AI_LIMITS } from "./ai/limits.server";
import { checkRateLimit } from "./rate-limit.server";

const WEEKLY_REPORT_TTL_SECONDS = 60 * 60 * 24;

function weeklyReportCacheKey(businessId: string) {
  return `weekly-report:${businessId}`;
}

/* --------------------------- inventory forecast -------------------------- */

export type InventoryForecastItem = {
  productId: string;
  name: string;
  stock: number;
  unit: string;
  dailyVelocity: number;
  daysUntilStockout: number | null;
  urgency: "out" | "critical" | "warning";
};

/** Pure math, no DB access — trailing-30-day sale velocity per product,
 * projected forward against current stock. Plain arithmetic, not a
 * forecasting model, same spirit as the deterministic health score in
 * loadDashboard. Split out from getInventoryForecast so it's directly
 * unit-testable with fixture data (see tests/insights-math.test.ts). */
export function computeInventoryForecast(
  products: { id: string; name: string; stock: number; unit: string }[],
  soldQuantityByProduct: Map<string, number>,
): InventoryForecastItem[] {
  const forecast: InventoryForecastItem[] = [];

  for (const product of products) {
    const stock = Number(product.stock);
    const dailyVelocity = (soldQuantityByProduct.get(product.id) ?? 0) / 30;

    if (stock <= 0) {
      forecast.push({
        productId: product.id,
        name: product.name,
        stock,
        unit: product.unit,
        dailyVelocity,
        daysUntilStockout: 0,
        urgency: "out",
      });
      continue;
    }

    if (dailyVelocity <= 0) continue;

    const daysUntilStockout = stock / dailyVelocity;
    if (daysUntilStockout > 14) continue;

    forecast.push({
      productId: product.id,
      name: product.name,
      stock,
      unit: product.unit,
      dailyVelocity,
      daysUntilStockout,
      urgency: daysUntilStockout <= 3 ? "critical" : "warning",
    });
  }

  return forecast.sort((a, b) => (a.daysUntilStockout ?? 0) - (b.daysUntilStockout ?? 0));
}

export async function getInventoryForecast(
  supabase: Db,
  businessId: string,
): Promise<InventoryForecastItem[]> {
  await assertPermission(supabase, businessId, "reports.financial");

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 29);
  windowStart.setHours(0, 0, 0, 0);

  const [productsRes, saleItemsRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, stock, unit")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .eq("is_active", true)
      .limit(1000),
    supabase
      .from("sale_items")
      .select("product_id, quantity")
      .eq("business_id", businessId)
      .gte("created_at", windowStart.toISOString()),
  ]);

  const products = productsRes.data ?? [];
  const saleItems = saleItemsRes.data ?? [];

  const soldByProduct = new Map<string, number>();
  for (const item of saleItems) {
    if (!item.product_id) continue;
    soldByProduct.set(
      item.product_id,
      (soldByProduct.get(item.product_id) ?? 0) + Number(item.quantity ?? 0),
    );
  }

  return computeInventoryForecast(
    products.map((p) => ({ id: p.id, name: p.name, stock: Number(p.stock), unit: p.unit })),
    soldByProduct,
  );
}

/* ------------------------------- anomalies ------------------------------- */

export type Anomaly = { severity: "warning" | "info"; message: string };

type AnomalyInput = {
  currency: string;
  now: Date;
  /** Completed sales from the last 14 days. */
  sales: { total: number; created_at: string }[];
  /** Expenses from the last 14 days. */
  recentExpenses: {
    amount: number;
    category: string;
    vendor: string | null;
    expense_date: string;
  }[];
  /** Expenses from the last 30 days, for category-average outlier detection. */
  categoryExpenses: { amount: number; category: string }[];
};

/** Pure math, no DB access — this-week-vs-last-week comparisons and
 * category-average outliers, using the same windowing pattern loadDashboard
 * uses (fetch a doubled window, split into current/previous buckets). Split
 * out from getAnomalies so it's directly unit-testable (see
 * tests/insights-math.test.ts). */
export function computeAnomalies(input: AnomalyInput): Anomaly[] {
  const { currency, now, sales, recentExpenses, categoryExpenses } = input;
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - 6);
  periodStart.setHours(0, 0, 0, 0);

  const anomalies: Anomaly[] = [];

  // Rule 1: revenue drop this week vs. last week.
  let thisWeekSales = 0;
  let lastWeekSales = 0;
  let lastWeekSaleCount = 0;
  for (const sale of sales) {
    const created = new Date(sale.created_at);
    if (created >= periodStart) {
      thisWeekSales += Number(sale.total ?? 0);
    } else {
      lastWeekSales += Number(sale.total ?? 0);
      lastWeekSaleCount++;
    }
  }
  if (lastWeekSaleCount >= 3 && lastWeekSales > 0) {
    const change = ((thisWeekSales - lastWeekSales) / lastWeekSales) * 100;
    if (change <= -30) {
      anomalies.push({
        severity: "warning",
        message: `Sales are down ${Math.abs(Math.round(change))}% this week compared to last week (${formatMoney(thisWeekSales, currency)} vs ${formatMoney(lastWeekSales, currency)}).`,
      });
    }
  }

  // Rule 2: expense spike this week vs. last week.
  let thisWeekExpenses = 0;
  let lastWeekExpenses = 0;
  for (const expense of recentExpenses) {
    const date = new Date(expense.expense_date);
    if (date >= periodStart) {
      thisWeekExpenses += Number(expense.amount ?? 0);
    } else {
      lastWeekExpenses += Number(expense.amount ?? 0);
    }
  }
  if (lastWeekExpenses > 0) {
    const change = ((thisWeekExpenses - lastWeekExpenses) / lastWeekExpenses) * 100;
    if (change >= 50) {
      anomalies.push({
        severity: "warning",
        message: `Expenses are up ${Math.round(change)}% this week compared to last week (${formatMoney(thisWeekExpenses, currency)} vs ${formatMoney(lastWeekExpenses, currency)}).`,
      });
    }
  }

  // Rule 3: a single expense far above its category's trailing average.
  const categoryTotals = new Map<string, { sum: number; count: number }>();
  for (const expense of categoryExpenses) {
    const entry = categoryTotals.get(expense.category) ?? { sum: 0, count: 0 };
    entry.sum += Number(expense.amount ?? 0);
    entry.count += 1;
    categoryTotals.set(expense.category, entry);
  }
  for (const expense of recentExpenses) {
    const date = new Date(expense.expense_date);
    if (date < periodStart) continue;
    const stats = categoryTotals.get(expense.category);
    if (!stats || stats.count < 3) continue;
    const average = stats.sum / stats.count;
    const amount = Number(expense.amount ?? 0);
    if (average > 0 && amount > average * 3) {
      anomalies.push({
        severity: "info",
        message: `Unusually large ${expense.category} expense: ${formatMoney(amount, currency)}${
          expense.vendor ? ` (${expense.vendor})` : ""
        }, about ${Math.round(amount / average)}x the usual amount for that category.`,
      });
    }
  }

  return anomalies;
}

export async function getAnomalies(supabase: Db, businessId: string): Promise<Anomaly[]> {
  await assertPermission(supabase, businessId, "reports.financial");

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - 13);
  windowStart.setHours(0, 0, 0, 0);
  const categoryWindowStart = new Date(now);
  categoryWindowStart.setDate(categoryWindowStart.getDate() - 29);
  categoryWindowStart.setHours(0, 0, 0, 0);

  const [businessRes, salesRes, expensesRes, categoryExpensesRes] = await Promise.all([
    supabase.from("businesses").select("currency").eq("id", businessId).maybeSingle(),
    supabase
      .from("sales")
      .select("total, created_at")
      .eq("business_id", businessId)
      .in("status", ["completed", "partially_refunded"])
      .gte("created_at", windowStart.toISOString()),
    supabase
      .from("expenses")
      .select("amount, category, vendor, expense_date")
      .eq("business_id", businessId)
      .gte("expense_date", windowStart.toISOString().slice(0, 10)),
    supabase
      .from("expenses")
      .select("amount, category")
      .eq("business_id", businessId)
      .gte("expense_date", categoryWindowStart.toISOString().slice(0, 10)),
  ]);

  return computeAnomalies({
    currency: businessRes.data?.currency ?? "USD",
    now,
    sales: salesRes.data ?? [],
    recentExpenses: expensesRes.data ?? [],
    categoryExpenses: categoryExpensesRes.data ?? [],
  });
}

/* ---------------------------- weekly AI report ---------------------------- */

const WEEKLY_REPORT_SYSTEM_PROMPT = `You are the BusinessOS AI assistant, writing a short weekly business
report for a small-business owner. Using ONLY the data given to you below, never invent numbers,
customers, or products that aren't in it, write a 4-6 sentence narrative summary of how the last 7
days went. Plain language a non-accountant would understand, no jargon like "COGS" or "accounts
receivable". Mention anything in the "Things to watch" list if present. End on a brief, concrete
suggestion if one is obvious from the numbers, otherwise skip it rather than inventing one.`;

export type WeeklyReport = { text: string; generatedAt: string; cached: boolean };

export async function getWeeklyReport(
  supabase: Db,
  businessId: string,
  forceRegenerate = false,
): Promise<WeeklyReport> {
  await assertPermission(supabase, businessId, "reports.financial");

  if (!forceRegenerate) {
    const cached = await cacheGet<WeeklyReport>(weeklyReportCacheKey(businessId));
    if (cached) return { ...cached, cached: true };
  }

  // Only checked on an actual generation (cache miss, or forceRegenerate) —
  // a cache hit costs nothing and shouldn't count against the budget. Loose
  // relative to the assistant's cap since this is already self-limited by
  // the 24h cache above; mainly bounds forceRegenerate abuse.
  const withinDailyLimit = await checkRateLimit(
    `ai-daily-report:business:${businessId}`,
    AI_LIMITS.weeklyReportDaily,
    WEEKLY_REPORT_TTL_SECONDS,
  );
  if (!withinDailyLimit) {
    throw new AppError(
      "This business has reached its daily AI report generation limit. Please try again tomorrow.",
    );
  }

  const [summary, anomalies] = await Promise.all([
    buildBusinessSummary(supabase, businessId, 7),
    getAnomalies(supabase, businessId),
  ]);

  const contextLines = [summary];
  if (anomalies.length > 0) {
    contextLines.push("Things to watch:");
    contextLines.push(...anomalies.map((a) => `- ${a.message}`));
  }

  const chatMessages: ChatMessage[] = [
    {
      role: "system",
      content: `${WEEKLY_REPORT_SYSTEM_PROMPT}\n\nBusiness snapshot:\n${contextLines.join("\n")}`,
    },
    { role: "user", content: "Write this week's report." },
  ];

  let text: string;
  try {
    text = await getAIProvider().chat(chatMessages);
  } catch (error) {
    console.error("[businessos] weekly report generation failed", error);
    throw new AppError("The weekly report isn't available right now. Please try again shortly.");
  }
  const report: WeeklyReport = { text, generatedAt: new Date().toISOString(), cached: false };

  await cacheSet(weeklyReportCacheKey(businessId), report, WEEKLY_REPORT_TTL_SECONDS);
  return report;
}
